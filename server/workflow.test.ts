import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from './app';
import { resetStore } from './store';
import { seedDemoCases } from './seed';
import { getCase } from './store';
import { buildWorkflow, currentWorkflowStep, ingestWorkflowEvent } from './workflow';

describe('installation workflow graph', () => {
  beforeEach(() => resetStore());

  it('builds parallel permit nodes from the same pack parent', () => {
    seedDemoCases();
    const rec = getCase('qot686kp');
    expect(rec).toBeTruthy();
    const wf = buildWorkflow(rec!);
    const city = wf.nodes.find((n) => n.id === 'city');
    const electrical = wf.nodes.find((n) => n.id === 'electrical');
    const fire = wf.nodes.find((n) => n.id === 'fire');
    expect(city?.dependsOn).toEqual(['pack']);
    expect(electrical?.dependsOn).toEqual(['pack']);
    expect(fire?.dependsOn).toEqual(['pack']);
    expect(city?.state).toBe('DONE');
  });

  it('keeps downstream nodes pending when registration is blocked', () => {
    seedDemoCases();
    const rec = getCase('lel1yrft');
    expect(rec).toBeTruthy();
    const wf = buildWorkflow(rec!);
    const ercot = wf.nodes.find((n) => n.id === 'ercot');
    const telemetry = wf.nodes.find((n) => n.id === 'telemetry');
    const dispatch = wf.nodes.find((n) => n.id === 'dispatch');
    expect(ercot?.state).toBe('BLOCKED');
    expect(telemetry?.state).toBe('PENDING');
    expect(dispatch?.state).toBe('PENDING');
  });

  it('marks Austin wait case at interconnection PTO', () => {
    seedDemoCases();
    const rec = getCase('qot686kp');
    const step = currentWorkflowStep(buildWorkflow(rec!));
    expect(step?.nodeId).toBe('pto');
    expect(step?.label).toContain('Interconnection');
  });

  it('ingest advances waiting PTO on Austin wait case', async () => {
    const app = createApp();
    await app.request('/api/ops/queue/admin');
    const rec = getCase('qot686kp');
    expect(rec).toBeTruthy();
    const result = ingestWorkflowEvent(rec!);
    expect(result.ok).toBe(true);
    const pto = rec!.workflow.nodes.find((n) => n.id === 'pto');
    expect(pto?.state).toBe('DONE');
  });

  it('returns workflow and currentStep from case API', async () => {
    const app = createApp();
    await app.request('/api/ops/queue/admin');
    const res = await app.request('/api/ops/cases/qot686kp');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.workflow.nodes.length).toBeGreaterThan(8);
    expect(data.currentStep).toBeTruthy();
    expect(data.currentStep.system).toBeTruthy();
  });

  it('adds and returns case notes', async () => {
    const app = createApp();
    await app.request('/api/ops/queue/admin');
    const res = await app.request('/api/ops/cases/qot686kp/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Left voicemail with homeowner.', author: 'Ops demo' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.notes[0].body).toBe('Left voicemail with homeowner.');
    expect(data.latestNote).toBe('Left voicemail with homeowner.');
    expect(data.noteCount).toBeGreaterThan(1);
  });

  it('returns 404 for missing case without crashing client parsers', async () => {
    const app = createApp();
    await app.request('/api/ops/queue/admin');
    const res = await app.request('/api/ops/cases/does-not-exist');
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('not_found');
  });
});
