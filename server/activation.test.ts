import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from './app';
import { resetStore } from './store';
import { activationSummary, allowedGateStatus, makeActivationState, operationalStatus } from './activation';

describe('activation workflow', () => {
  beforeEach(() => resetStore());

  it('seeds diverse utility and activation scenarios', async () => {
    const response = await createApp().request('/api/ops/queue/ops_maya');
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.cases.some((item: any) => item.activationSummary.source === 'AUSTIN_ENERGY')).toBe(true);
    expect(data.cases.some((item: any) => item.activationSummary.correctionNeeded)).toBe(true);
    expect(data.cases.some((item: any) => item.activationSummary.dispatchReady)).toBe(true);
    expect(data.cases).toHaveLength(12);
    expect(new Set(data.cases.map((item: any) => item.fingerprint.city))).toEqual(new Set(['Austin', 'Round Rock', 'Dallas', 'Houston', 'San Antonio']));
    expect(new Set(data.cases.map((item: any) => item.fingerprint.utility))).toEqual(new Set(['Austin Energy', 'Oncor', 'CenterPoint Energy', 'CPS Energy']));
    expect(new Set(data.cases.map((item: any) => item.pack))).toEqual(new Set(['AUSTIN_RICH', 'ROUNDROCK_ONCOR', 'DALLAS_ONCOR', 'HOUSTON_STUB', 'SANANTONIO_STUB']));
    expect(data.cases.filter((item: any) => item.operationalStatus === 'BLOCKED')).toHaveLength(2);
    expect(data.cases.filter((item: any) => item.operationalStatus === 'OPERATIONAL')).toHaveLength(1);
    expect(data.cases.filter((item: any) => item.operationalStatus === 'WAITING')).toHaveLength(9);
  });

  it('derives operational status with blocking conditions taking precedence', () => {
    const waiting = makeActivationState('AUSTIN_UTILITY_MANAGED', 'AUSTIN_WAIT');
    const correction = makeActivationState('ERCOT_ADER', 'ERCOT_CORRECTION');
    const ready = makeActivationState('ERCOT_ADER', 'DISPATCH_READY');
    expect(operationalStatus('OPS_READY', 'AUSTIN_UTILITY_MANAGED', waiting.activationGates).status).toBe('WAITING');
    expect(operationalStatus('OPS_READY', 'ERCOT_ADER', correction.activationGates).status).toBe('BLOCKED');
    expect(operationalStatus('OPS_READY', 'ERCOT_ADER', ready.activationGates).status).toBe('OPERATIONAL');
    expect(operationalStatus('OPS_READY', 'UNKNOWN', []).reason).toBe('Activation information not configured.');
  });

  it('summarizes waiting and correction gates independently', () => {
    const waiting = makeActivationState('AUSTIN_UTILITY_MANAGED', 'AUSTIN_WAIT');
    const correction = makeActivationState('ERCOT_ADER', 'ERCOT_CORRECTION');
    expect(activationSummary('AUSTIN_UTILITY_MANAGED', waiting.activationGates).awaitingExternal).toBe(true);
    expect(activationSummary('ERCOT_ADER', correction.activationGates).correctionNeeded).toBe(true);
  });

  it('acknowledges feedback, assigns a gate, and preserves audit events', async () => {
    const app = createApp();
    const queue = await (await app.request('/api/ops/queue/ops_maya')).json();
    const record = queue.cases.find((item: any) => item.activationSummary.correctionNeeded);
    const detail = await (await app.request(`/api/ops/cases/${record.id}`)).json();
    const feedback = detail.externalEvents.find((item: any) => item.type === 'FEEDBACK');
    const gate = detail.activationGates.find((item: any) => item.status === 'QUESTIONS');

    const acknowledged = await app.request(`/api/ops/cases/${record.id}/activation/events/${feedback.id}/acknowledge`, { method: 'POST' });
    expect(acknowledged.status).toBe(200);
    const assigned = await app.request(`/api/ops/cases/${record.id}/activation/gates/${gate.key}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'base_admin' }) });
    expect(assigned.status).toBe(200);
    const updated = await assigned.json();
    expect(updated.activationGates.find((item: any) => item.key === gate.key).owner).toBe('base_admin');
    expect(updated.externalEvents.some((item: any) => item.type === 'ACKNOWLEDGED')).toBe(true);
    expect(updated.externalEvents.some((item: any) => item.type === 'ASSIGNED')).toBe(true);
  });

  it('rejects invalid transitions and exposes allowed transitions', () => {
    expect(allowedGateStatus('NOT_STARTED')).toEqual(['SUBMITTED', 'FAILED']);
    expect(allowedGateStatus('SUBMITTED')).toContain('ACCEPTED');
  });
});
