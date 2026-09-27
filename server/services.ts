import type {
  ActivationGateKey,
  CaseRecord,
  SystemId,
  WorkflowNodeState,
} from './types';
import { applyServiceEvent, attachWorkflow, buildWorkflow } from './workflow';

const PERMIT_NODE_IDS = new Set(['pack', 'city', 'electrical', 'fire']);
const DOWNSTREAM_NODE_IDS = ['field', 'inspection', 'pto', 'ercot', 'telemetry', 'dispatch', 'ancillary', 'activation_config'];

const GATE_NODE: Record<ActivationGateKey, string> = {
  AUSTIN_INSPECTION: 'inspection',
  INTERCONNECTION_PTO: 'pto',
  ERCOT_REGISTRATION: 'ercot',
  TELEMETRY: 'telemetry',
  DISPATCH_QUALIFICATION: 'dispatch',
  ANCILLARY_SERVICES: 'ancillary',
};

function permitNodes(rec: CaseRecord) {
  const wf = rec.workflow ?? buildWorkflow(rec);
  return wf.nodes.filter((n) => PERMIT_NODE_IDS.has(n.id));
}

function fieldNode(rec: CaseRecord) {
  const wf = rec.workflow ?? buildWorkflow(rec);
  return wf.nodes.find((n) => n.id === 'field');
}

function compensatePermitFailure(rec: CaseRecord, now: number) {
  if (!rec.workflowOverrides) rec.workflowOverrides = {};
  const wf = buildWorkflow(rec, now);
  for (const nodeId of DOWNSTREAM_NODE_IDS) {
    const node = wf.nodes.find((n) => n.id === nodeId);
    if (node && (node.state === 'DONE' || node.state === 'RUNNING' || node.state === 'WAITING_EXTERNAL')) {
      rec.workflowOverrides[nodeId] = {
        state: 'PENDING',
        issue: 'Upstream permit check failed.',
        nextAction: 'Resolve permit issue before continuing.',
      };
    }
  }
}

export function listPermitsQueue(cases: CaseRecord[]): CaseRecord[] {
  return cases.filter((rec) => {
    const nodes = permitNodes(rec);
    return nodes.some((n) => n.state !== 'DONE') || nodes.some((n) => n.state === 'BLOCKED');
  });
}

export function listFieldQueue(cases: CaseRecord[]): CaseRecord[] {
  const buckets = fieldQueueBuckets(cases);
  return [...buckets.active, ...buckets.upcoming, ...buckets.completed];
}

export type FieldQueueBuckets = {
  active: CaseRecord[];
  upcoming: CaseRecord[];
  completed: CaseRecord[];
};

/** Active = crew on site or blocked; upcoming = permits clearing; completed = WO closed. */
export function fieldQueueBuckets(cases: CaseRecord[]): FieldQueueBuckets {
  const active: CaseRecord[] = [];
  const upcoming: CaseRecord[] = [];
  const completed: CaseRecord[] = [];
  for (const rec of cases) {
    const field = fieldNode(rec);
    if (!field) continue;
    if (field.state === 'DONE') {
      completed.push(rec);
      continue;
    }
    if (field.state === 'PENDING') {
      upcoming.push(rec);
      continue;
    }
    active.push(rec);
  }
  return { active, upcoming, completed };
}

export function listActivationQueue(cases: CaseRecord[]): CaseRecord[] {
  return cases.filter((rec) => rec.activationGates.length > 0 && rec.activationGates.some((g) => g.status !== 'ACCEPTED'));
}

export function applyPermitCheck(
  rec: CaseRecord,
  nodeId: string,
  action: 'complete' | 'reject',
  now = Date.now(),
): { ok: boolean; message: string } {
  if (!PERMIT_NODE_IDS.has(nodeId)) {
    return { ok: false, message: 'Invalid permit node.' };
  }
  const label = { pack: 'Permit pack', city: 'City permit', electrical: 'Electrical rules', fire: 'Fire rules' }[nodeId] ?? nodeId;
  if (action === 'complete') {
    applyServiceEvent(rec, {
      nodeId,
      system: 'PERMIT_KB',
      state: 'DONE',
      summary: `${label} check completed.`,
      eventType: 'PermitCheckCompleted',
      now,
    });
    return { ok: true, message: `${label} marked complete.` };
  }
  applyServiceEvent(rec, {
    nodeId,
    system: 'PERMIT_KB',
    state: 'BLOCKED',
    summary: `${label} rejected — requirements not met.`,
    eventType: 'PermitCheckRejected',
    issue: `${label} failed review.`,
    nextAction: 'Correct findings and resubmit permit check.',
    now,
  });
  compensatePermitFailure(rec, now);
  attachWorkflow(rec, now);
  return { ok: true, message: `${label} rejected.` };
}

export function applyFieldWorkOrder(
  rec: CaseRecord,
  action: 'complete' | 'block',
  now = Date.now(),
): { ok: boolean; message: string } {
  const field = fieldNode(rec);
  if (!field) return { ok: false, message: 'Field node not found.' };
  if (action === 'complete') {
    const permitsReady = permitNodes(rec).every((n) => n.state === 'DONE');
    if (!permitsReady) {
      return { ok: false, message: 'Permit checks must be complete before closing the work order.' };
    }
    applyServiceEvent(rec, {
      nodeId: 'field',
      system: 'ERP',
      state: 'DONE',
      summary: 'Work order closed — install crew marked site complete.',
      eventType: 'WorkOrderClosed',
      nextAction: 'No action required',
      now,
    });
    rec.status = 'OPS_READY';
    rec.jobState = 'OPS_READY';
    return { ok: true, message: 'Work order closed.' };
  }
  applyServiceEvent(rec, {
    nodeId: 'field',
    system: 'ERP',
    state: 'BLOCKED',
    summary: 'Field install blocked — site not ready.',
    eventType: 'WorkOrderBlocked',
    issue: 'Crew could not complete install.',
    nextAction: 'Schedule return visit after site corrections.',
    now,
  });
  return { ok: true, message: 'Work order blocked.' };
}

export function applyActivationGateAction(
  rec: CaseRecord,
  gateKey: ActivationGateKey,
  action: 'accept' | 'fail',
  now = Date.now(),
): { ok: boolean; message: string } {
  const gate = rec.activationGates.find((g) => g.key === gateKey);
  if (!gate) return { ok: false, message: 'Gate not found.' };
  const nodeId = GATE_NODE[gateKey];
  const system: SystemId = gateKey === 'TELEMETRY' ? 'QSE' : gateKey === 'ERCOT_REGISTRATION' || gateKey === 'DISPATCH_QUALIFICATION' || gateKey === 'ANCILLARY_SERVICES' ? 'ERCOT' : 'AUSTIN_ENERGY';

  if (action === 'accept') {
    if (gate.status === 'ACCEPTED') {
      return { ok: false, message: 'Gate already accepted.' };
    }
    gate.status = 'ACCEPTED';
    gate.issue = undefined;
    gate.nextAction = undefined;
    gate.updatedAt = now;
    rec.externalEvents.push({
      id: `evt_${rec.externalEvents.length + 1}`,
      type: 'STATUS_CHANGED',
      source: gate.source,
      gateKey: gate.key,
      message: `${gate.label} accepted.`,
      timestamp: now,
      acknowledged: true,
    });
    applyServiceEvent(rec, {
      nodeId,
      system,
      state: 'DONE',
      summary: `${gate.label} accepted.`,
      eventType: 'ActivationGateAccepted',
      now,
    });
    return { ok: true, message: `${gate.label} accepted.` };
  }

  gate.status = 'FAILED';
  gate.issue = gate.issue ?? `${gate.label} rejected by external system.`;
  gate.nextAction = 'Correct and resubmit.';
  gate.updatedAt = now;
  rec.externalEvents.push({
    id: `evt_${rec.externalEvents.length + 1}`,
    type: 'FEEDBACK',
    source: gate.source,
    gateKey: gate.key,
    message: gate.issue,
    timestamp: now,
    acknowledged: false,
  });
  applyServiceEvent(rec, {
    nodeId,
    system,
    state: 'BLOCKED',
    summary: `${gate.label} failed.`,
    eventType: 'RegistrationFailed',
    issue: gate.issue,
    nextAction: gate.nextAction,
    now,
  });
  attachWorkflow(rec, now);
  return { ok: true, message: `${gate.label} marked failed.` };
}
