import type {
  ActivationGate,
  ActivationGateKey,
  ActivationGateStatus,
  ActivationRoute,
  ActivationSource,
  ActivationSummary,
  ExternalEvent,
} from './types';

const day = 24 * 60 * 60 * 1000;

const definitions: Record<ActivationGateKey, { label: string; source: ActivationSource }> = {
  AUSTIN_INSPECTION: { label: 'Austin Energy inspection', source: 'AUSTIN_ENERGY' },
  INTERCONNECTION_PTO: { label: 'Interconnection / PTO', source: 'AUSTIN_ENERGY' },
  ERCOT_REGISTRATION: { label: 'ERCOT registration', source: 'ERCOT' },
  TELEMETRY: { label: 'Telemetry validation', source: 'QSE' },
  DISPATCH_QUALIFICATION: { label: 'Dispatch qualification', source: 'ERCOT' },
  ANCILLARY_SERVICES: { label: 'Ancillary services', source: 'ERCOT' },
};

export type ActivationScenario = 'AUSTIN_WAIT' | 'ERCOT_CORRECTION' | 'TELEMETRY_PENDING' | 'DISPATCH_READY';

function gate(key: ActivationGateKey, status: ActivationGateStatus, now: number, partial: Partial<ActivationGate> = {}): ActivationGate {
  return { key, ...definitions[key], status, updatedAt: now, ...partial };
}

export function makeActivationState(route: ActivationRoute, scenario: ActivationScenario, now = Date.now()): { activationGates: ActivationGate[]; externalEvents: ExternalEvent[] } {
  const events: ExternalEvent[] = [];
  const addEvent = (event: Omit<ExternalEvent, 'id'>) => events.push({ ...event, id: `evt_${events.length + 1}` });
  const overdue = now - day;
  let activationGates: ActivationGate[];

  if (route === 'AUSTIN_UTILITY_MANAGED') {
    activationGates = [
      gate('AUSTIN_INSPECTION', 'ACCEPTED', now),
      gate('INTERCONNECTION_PTO', 'SUBMITTED', now, { nextAction: 'Wait for Austin Energy interconnection response' }),
    ];
  } else {
    activationGates = [
      gate('AUSTIN_INSPECTION', 'ACCEPTED', now),
      gate('INTERCONNECTION_PTO', 'ACCEPTED', now),
      gate('ERCOT_REGISTRATION', 'SUBMITTED', now, { nextAction: 'Wait for ERCOT registration response' }),
      gate('TELEMETRY', 'NOT_STARTED', now, { nextAction: 'Validate telemetry with QSE' }),
      gate('DISPATCH_QUALIFICATION', 'NOT_STARTED', now),
      gate('ANCILLARY_SERVICES', 'NOT_STARTED', now),
    ];
  }

  if (scenario === 'AUSTIN_WAIT') {
    const g = activationGates.find((item) => item.key === 'INTERCONNECTION_PTO')!;
    g.dueAt = overdue;
    g.externalRef = 'AE-INT-1042';
    addEvent({ type: 'FEEDBACK', source: 'AUSTIN_ENERGY', gateKey: g.key, message: 'Inspection passed; interconnection review is still pending.', timestamp: now - 2 * day, acknowledged: false });
  }
  if (scenario === 'ERCOT_CORRECTION') {
    const g = activationGates.find((item) => item.key === 'ERCOT_REGISTRATION')!;
    g.status = 'QUESTIONS';
    g.externalRef = 'ERCOT-ADER-8841';
    g.issue = 'Premise identifier does not match the submitted registration record.';
    g.nextAction = 'Correct the premise identifier and resubmit.';
    g.owner = 'ops_maya';
    addEvent({ type: 'FEEDBACK', source: 'ERCOT', gateKey: g.key, message: g.issue, timestamp: now - day, acknowledged: false });
  }
  if (scenario === 'TELEMETRY_PENDING') {
    const g = activationGates.find((item) => item.key === 'TELEMETRY')!;
    g.status = 'SUBMITTED';
    g.externalRef = 'QSE-TEL-204';
    g.owner = 'ops_maya';
    g.nextAction = 'Wait for telemetry validation result.';
    addEvent({ type: 'FEEDBACK', source: 'QSE', gateKey: g.key, message: 'Telemetry package received and queued for validation.', timestamp: now - 3 * 60 * 60 * 1000, acknowledged: true, assignedOwner: g.owner });
  }
  if (scenario === 'DISPATCH_READY') {
    activationGates = activationGates.map((g) => gate(g.key, 'ACCEPTED', now, { externalRef: `DEMO-${g.key}` }));
    addEvent({ type: 'STATUS_CHANGED', source: 'ERCOT', gateKey: 'DISPATCH_QUALIFICATION', message: 'Dispatch qualification accepted; resource is ready for dispatch.', timestamp: now - 60 * 60 * 1000, acknowledged: true });
  }

  return { activationGates, externalEvents: events };
}

export function activationSummary(route: ActivationRoute, gates: ActivationGate[], now = Date.now()): ActivationSummary {
  const current = gates.find((g) => g.status !== 'ACCEPTED');
  const correctionNeeded = gates.some((g) => g.status === 'QUESTIONS' || g.status === 'FAILED');
  const awaitingExternal = gates.some((g) => g.status === 'SUBMITTED');
  const telemetry = gates.find((g) => g.key === 'TELEMETRY');
  const dispatch = gates.find((g) => g.key === 'DISPATCH_QUALIFICATION');
  return {
    route,
    currentGate: current?.key,
    currentLabel: current?.label,
    source: current?.source,
    status: current?.status,
    owner: current?.owner,
    overdue: Boolean(current?.dueAt && current.dueAt < now && current.status !== 'ACCEPTED'),
    correctionNeeded,
    awaitingExternal,
    telemetryPending: Boolean(telemetry && telemetry.status !== 'ACCEPTED'),
    dispatchReady: Boolean(dispatch && dispatch.status === 'ACCEPTED'),
  };
}

export function allowedGateStatus(status: ActivationGateStatus): ActivationGateStatus[] {
  if (status === 'NOT_STARTED') return ['SUBMITTED', 'FAILED'];
  if (status === 'SUBMITTED') return ['QUESTIONS', 'FAILED', 'ACCEPTED'];
  if (status === 'QUESTIONS' || status === 'FAILED') return ['SUBMITTED', 'ACCEPTED'];
  return ['ACCEPTED'];
}

