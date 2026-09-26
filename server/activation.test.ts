import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from './app';
import { resetStore } from './store';
import { activationSummary, allowedGateStatus, makeActivationState } from './activation';

describe('activation workflow', () => {
  beforeEach(() => resetStore());

  it('seeds distinct Austin and ERCOT readiness scenarios', async () => {
    const response = await createApp().request('/api/ops/queue/ops_maya');
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.cases.some((item: any) => item.activationSummary.source === 'AUSTIN_ENERGY')).toBe(true);
    expect(data.cases.some((item: any) => item.activationSummary.correctionNeeded)).toBe(true);
    expect(data.cases.some((item: any) => item.activationSummary.dispatchReady)).toBe(true);
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
    const assigned = await app.request(`/api/ops/cases/${record.id}/activation/gates/${gate.key}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'ops_sam' }) });
    expect(assigned.status).toBe(200);
    const updated = await assigned.json();
    expect(updated.activationGates.find((item: any) => item.key === gate.key).owner).toBe('ops_sam');
    expect(updated.externalEvents.some((item: any) => item.type === 'ACKNOWLEDGED')).toBe(true);
    expect(updated.externalEvents.some((item: any) => item.type === 'ASSIGNED')).toBe(true);
  });

  it('rejects invalid transitions and exposes allowed transitions', () => {
    expect(allowedGateStatus('NOT_STARTED')).toEqual(['SUBMITTED', 'FAILED']);
    expect(allowedGateStatus('SUBMITTED')).toContain('ACCEPTED');
  });
});
