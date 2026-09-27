import type {
  ActivationGate,
  ActivationGateKey,
  ActivationGateStatus,
  ActivationRoute,
  CaseRecord,
  CaseWorkflow,
  ExternalEvent,
  PackId,
  SystemEvent,
  SystemId,
  WorkflowNode,
  WorkflowNodeState,
  WorkflowStep,
} from './types';
import type { ActivationScenario } from './activation';

const day = 24 * 60 * 60 * 1000;

const GATE_NODE: Record<ActivationGateKey, string> = {
  AUSTIN_INSPECTION: 'inspection',
  INTERCONNECTION_PTO: 'pto',
  ERCOT_REGISTRATION: 'ercot',
  TELEMETRY: 'telemetry',
  DISPATCH_QUALIFICATION: 'dispatch',
  ANCILLARY_SERVICES: 'ancillary',
};

const NODE_GATE: Record<string, ActivationGateKey> = Object.fromEntries(
  Object.entries(GATE_NODE).map(([k, v]) => [v, k as ActivationGateKey]),
) as Record<string, ActivationGateKey>;

function gateStateToNode(status: ActivationGateStatus): WorkflowNodeState {
  if (status === 'ACCEPTED') return 'DONE';
  if (status === 'SUBMITTED') return 'WAITING_EXTERNAL';
  if (status === 'QUESTIONS' || status === 'FAILED') return 'BLOCKED';
  return 'PENDING';
}

function gateSystem(key: ActivationGateKey): SystemId {
  if (key === 'TELEMETRY') return 'QSE';
  if (key === 'ERCOT_REGISTRATION' || key === 'DISPATCH_QUALIFICATION' || key === 'ANCILLARY_SERVICES') return 'ERCOT';
  return 'AUSTIN_ENERGY';
}

function applyDependencyStates(nodes: WorkflowNode[]): WorkflowNode[] {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, { ...n }]));
  const blocked = new Set<string>();
  for (const node of nodes) {
    if (node.state === 'BLOCKED') blocked.add(node.id);
  }
  for (const node of nodes) {
    const n = byId[node.id];
    if (n.state !== 'PENDING' && n.state !== 'RUNNING') continue;
    const depBlocked = node.dependsOn.some((id) => byId[id]?.state === 'BLOCKED');
    const depPending = node.dependsOn.some((id) => {
      const d = byId[id];
      return !d || d.state === 'PENDING' || d.state === 'RUNNING' || d.state === 'WAITING_EXTERNAL' || d.state === 'BLOCKED';
    });
    if (depBlocked || (depPending && node.dependsOn.length > 0)) {
      if (n.state === 'RUNNING') n.state = 'PENDING';
    }
  }
  return Object.values(byId);
}

function baseEvents(now: number, pack: PackId): SystemEvent[] {
  const events: SystemEvent[] = [];
  let i = 0;
  const add = (nodeId: string, system: SystemId, summary: string, ago: number, payload?: Record<string, string>) => {
    events.push({ id: `wf_${++i}`, nodeId, system, receivedAt: now - ago, summary, payload });
  };
  add('intake', 'HUBSPOT', 'Deal created — homeowner qualified for ESS install.', 12 * day, { dealId: 'HS-48291', stage: 'Install pipeline' });
  add('photos', 'PHOTO_CHECK', 'Customer completed Home Photo Check — 7 photos on device.', 10 * day, { photos: '7', meterNumber: 'on file' });
  add('pack', 'PERMIT_KB', `Jurisdiction pack resolved: ${pack}.`, 9 * day, { pack });
  add('city', 'PERMIT_KB', 'City permit requirements verified against pack rules.', 8 * day);
  add('electrical', 'PERMIT_KB', 'Electrical code requirements checked (NEC anchor).', 8 * day);
  add('fire', 'PERMIT_KB', 'Fire code guidance confirmed for ESS placement.', 8 * day);
  add('field', 'ERP', 'Work order closed — install crew marked site complete.', 5 * day, { workOrder: 'WO-8842' });
  return events;
}

function activationEvents(
  gates: ActivationGate[],
  external: ExternalEvent[],
  now: number,
): SystemEvent[] {
  const events: SystemEvent[] = [];
  let i = 100;
  for (const gate of gates) {
    const nodeId = GATE_NODE[gate.key];
    if (gate.status === 'ACCEPTED') {
      events.push({
        id: `wf_${++i}`,
        nodeId,
        system: gateSystem(gate.key),
        receivedAt: gate.updatedAt,
        summary: `${gate.label} accepted.`,
        payload: gate.externalRef ? { externalRef: gate.externalRef } : undefined,
      });
    }
  }
  for (const evt of external) {
    const nodeId = evt.gateKey ? GATE_NODE[evt.gateKey] : 'pto';
    events.push({
      id: `wf_${++i}`,
      nodeId,
      system: evt.source === 'QSE' ? 'QSE' : evt.source === 'ERCOT' ? 'ERCOT' : 'AUSTIN_ENERGY',
      receivedAt: evt.timestamp,
      summary: evt.message,
      payload: evt.gateKey ? { gateKey: evt.gateKey, type: evt.type } : undefined,
    });
  }
  addInspectionEvent(events, now);
  return events.sort((a, b) => a.receivedAt - b.receivedAt);
}

function addInspectionEvent(events: SystemEvent[], now: number) {
  if (!events.some((e) => e.nodeId === 'inspection')) {
    events.push({
      id: 'wf_insp',
      nodeId: 'inspection',
      system: 'AUSTIN_ENERGY',
      receivedAt: now - 6 * day,
      summary: 'Austin Energy inspection passed.',
    });
  }
}

function ruleIdsForPack(pack: PackId): string[] {
  const map: Partial<Record<PackId, string[]>> = {
    AUSTIN_RICH: ['austin_permits_general', 'austin_fire_guidance', 'austin_energy_interconnection'],
    ROUNDROCK_ONCOR: ['oncor_dg_shared'],
    DALLAS_ONCOR: ['oncor_dg_shared'],
  };
  return map[pack] ?? [];
}

export function buildWorkflow(rec: CaseRecord, now = Date.now()): CaseWorkflow {
  const hasActivation = rec.activationGates.length > 0;
  const route = rec.activationRoute;
  const ruleIds = ruleIdsForPack(rec.pack);

  const intake: WorkflowNode = {
    id: 'intake',
    label: 'Hubspot intake',
    lane: 'INTAKE',
    system: 'HUBSPOT',
    dependsOn: [],
    state: 'DONE',
    updatedAt: now - 12 * day,
    nextAction: 'No action required',
  };

  const photos: WorkflowNode = {
    id: 'photos',
    label: 'Photo check',
    lane: 'SITE',
    system: 'PHOTO_CHECK',
    dependsOn: ['intake'],
    state: rec.sitePhotos?.length ? 'DONE' : 'RUNNING',
    updatedAt: now - 10 * day,
    nextAction: rec.sitePhotos?.length ? 'No action required' : 'Waiting for customer photos',
  };

  const pack: WorkflowNode = {
    id: 'pack',
    label: 'Permit pack',
    lane: 'PERMIT',
    system: 'PERMIT_KB',
    dependsOn: ['intake'],
    state: rec.pack === 'UNKNOWN_PACK' ? 'BLOCKED' : 'DONE',
    updatedAt: now - 9 * day,
    ruleIds,
    issue: rec.pack === 'UNKNOWN_PACK' ? 'Jurisdiction pack unknown.' : undefined,
    nextAction: rec.pack === 'UNKNOWN_PACK' ? 'Add verified rules for this address.' : 'No action required',
  };

  const permitDone = pack.state === 'DONE';
  const city: WorkflowNode = {
    id: 'city',
    label: 'City permit',
    lane: 'PERMIT',
    system: 'PERMIT_KB',
    dependsOn: ['pack'],
    state: permitDone ? 'DONE' : 'PENDING',
    updatedAt: now - 8 * day,
    ruleIds: ruleIds.filter((id) => id.includes('permit') || id.includes('austin_permits')),
  };

  const electrical: WorkflowNode = {
    id: 'electrical',
    label: 'Electrical rules',
    lane: 'PERMIT',
    system: 'PERMIT_KB',
    dependsOn: ['pack'],
    state: permitDone ? 'DONE' : 'PENDING',
    updatedAt: now - 8 * day,
    ruleIds: ['nec_2023_anchor'],
  };

  const fire: WorkflowNode = {
    id: 'fire',
    label: 'Fire rules',
    lane: 'PERMIT',
    system: 'PERMIT_KB',
    dependsOn: ['pack'],
    state: permitDone ? 'DONE' : 'PENDING',
    updatedAt: now - 8 * day,
    ruleIds: ruleIds.filter((id) => id.includes('fire')),
  };

  const field: WorkflowNode = {
    id: 'field',
    label: 'Field install',
    lane: 'FIELD',
    system: 'ERP',
    dependsOn: ['photos', 'city', 'electrical', 'fire'],
    state: hasActivation || rec.status === 'OPS_READY' ? 'DONE' : 'RUNNING',
    updatedAt: now - 5 * day,
    nextAction: 'No action required',
    externalRef: 'WO-8842',
  };

  const nodes: WorkflowNode[] = [intake, photos, pack, city, electrical, fire, field];

  if (!hasActivation) {
    nodes.push({
      id: 'activation_config',
      label: 'Activation',
      lane: 'ACTIVATION',
      system: 'BASE_OPS',
      dependsOn: ['field'],
      state: 'WAITING_EXTERNAL',
      updatedAt: now,
      nextAction: 'Activation route not configured for this utility.',
      issue: 'Interconnection and dispatch gates are not set up yet.',
    });
    const events = baseEvents(now, rec.pack);
    return { nodes: applyDependencyStates(nodes), events };
  }

  const gateNode = (key: ActivationGateKey, dependsOn: string[]): WorkflowNode => {
    const g = rec.activationGates.find((item) => item.key === key)!;
    return {
      id: GATE_NODE[key],
      label: g.label,
      lane: 'ACTIVATION',
      system: gateSystem(key),
      dependsOn,
      state: gateStateToNode(g.status),
      issue: g.issue,
      nextAction: g.nextAction,
      owner: g.owner,
      externalRef: g.externalRef,
      dueAt: g.dueAt,
      updatedAt: g.updatedAt,
    };
  };

  nodes.push(gateNode('AUSTIN_INSPECTION', ['field']));
  nodes.push(gateNode('INTERCONNECTION_PTO', ['inspection']));

  if (route === 'ERCOT_ADER' || route === 'BOTH') {
    nodes.push(gateNode('ERCOT_REGISTRATION', ['pto']));
    nodes.push(gateNode('TELEMETRY', ['ercot']));
    nodes.push(gateNode('DISPATCH_QUALIFICATION', ['telemetry']));
    nodes.push(gateNode('ANCILLARY_SERVICES', ['telemetry']));
  }

  const events = [...baseEvents(now, rec.pack), ...activationEvents(rec.activationGates, rec.externalEvents, now)];
  if (rec.workflow?.events?.length) {
    const seeded = new Set(events.map((e) => e.id));
    for (const e of rec.workflow.events) {
      if (!seeded.has(e.id)) events.push(e);
    }
    events.sort((a, b) => a.receivedAt - b.receivedAt);
  }

  return { nodes: applyDependencyStates(nodes), events };
}

export function bottleneckNodeId(workflow: CaseWorkflow): string | null {
  const order = ['BLOCKED', 'WAITING_EXTERNAL', 'RUNNING', 'PENDING'] as const;
  for (const state of order) {
    const node = workflow.nodes.find((n) => n.state === state);
    if (node) return node.id;
  }
  return workflow.nodes.find((n) => n.state !== 'DONE')?.id ?? workflow.nodes.at(-1)?.id ?? null;
}

export function currentWorkflowStep(workflow: CaseWorkflow): WorkflowStep | null {
  const id = bottleneckNodeId(workflow);
  if (!id) return null;
  const node = workflow.nodes.find((n) => n.id === id);
  if (!node) return null;
  return { nodeId: node.id, label: node.label, system: node.system };
}

/** Demo ingest: advance the next waiting external node or unblock a correction. */
export function ingestWorkflowEvent(rec: CaseRecord, now = Date.now()): { ok: boolean; message: string } {
  const workflow = rec.workflow ?? buildWorkflow(rec, now);
  const waiting = workflow.nodes.find((n) => n.state === 'WAITING_EXTERNAL');
  const blocked = workflow.nodes.find((n) => n.state === 'BLOCKED');

  if (blocked) {
    const gateKey = NODE_GATE[blocked.id];
    if (gateKey) {
      const gate = rec.activationGates.find((g) => g.key === gateKey);
      if (gate) {
        gate.status = 'SUBMITTED';
        gate.issue = undefined;
        gate.updatedAt = now;
        gate.nextAction = 'Wait for external response after resubmission.';
        rec.externalEvents.push({
          id: `evt_${rec.externalEvents.length + 1}`,
          type: 'STATUS_CHANGED',
          source: gate.source,
          gateKey: gate.key,
          message: 'Correction submitted — waiting for external review.',
          timestamp: now,
          acknowledged: true,
        });
      }
    }
    workflow.events.push({
      id: `wf_ingest_${now}`,
      nodeId: blocked.id,
      system: blocked.system,
      receivedAt: now,
      summary: 'Correction resubmitted from Base Ops.',
    });
    rec.workflow = buildWorkflow(rec, now);
    rec.workflow.events.push(workflow.events[workflow.events.length - 1]);
    return { ok: true, message: `${blocked.label} resubmitted.` };
  }

  if (waiting) {
    const gateKey = NODE_GATE[waiting.id];
    if (gateKey) {
      const gate = rec.activationGates.find((g) => g.key === gateKey);
      if (gate) {
        gate.status = 'ACCEPTED';
        gate.updatedAt = now;
        gate.nextAction = undefined;
        rec.externalEvents.push({
          id: `evt_${rec.externalEvents.length + 1}`,
          type: 'STATUS_CHANGED',
          source: gate.source,
          gateKey: gate.key,
          message: `${gate.label} accepted by ${gate.source.replaceAll('_', ' ')}.`,
          timestamp: now,
          acknowledged: true,
        });
      }
    }
    const evt: SystemEvent = {
      id: `wf_ingest_${now}`,
      nodeId: waiting.id,
      system: waiting.system,
      receivedAt: now,
      summary: `${waiting.label} accepted — external system webhook.`,
      payload: waiting.externalRef ? { externalRef: waiting.externalRef } : undefined,
    };
    rec.workflow = buildWorkflow(rec, now);
    rec.workflow.events.push(evt);
    return { ok: true, message: `${waiting.label} marked complete.` };
  }

  return { ok: false, message: 'No waiting or blocked nodes to advance.' };
}

export function attachWorkflow(rec: CaseRecord, now = Date.now()): CaseRecord {
  rec.workflow = buildWorkflow(rec, now);
  return rec;
}

export type { ActivationScenario };
