import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { resetStore, listCasesByAssignee, getCase, saveCase } from './store';
import { seedDemoCases, deriveUtilityType, resolvePack } from './seed';
import { planAndRun } from './runner';
import { activationSummary, allowedGateStatus, makeActivationState } from './activation';
import type { ActivationGateKey, ActivationGateStatus, CreateCaseBody, ExternalEventType } from './types';

export function createApp() {
  const app = new Hono().basePath('/api');
  app.use('*', cors());
  app.use('*', prettyJSON());

  // Health
  app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

  // Seed on first access
  app.get('/ops/queue/:userId', (c) => {
    seedDemoCases();
    const list = listCasesByAssignee('base_admin');
    const cases = list
      .map((item) => ({ ...item, activationSummary: activationSummary(item.activationRoute, item.activationGates, Date.now(), item.externalEvents) }))
      .sort((a, b) => Number(b.activationSummary.overdue || b.activationSummary.correctionNeeded) - Number(a.activationSummary.overdue || a.activationSummary.correctionNeeded));
    return c.json({ userId: 'base_admin', cases });
  });

  app.get('/ops/cases/:caseId', (c) => {
    const { caseId } = c.req.param();
    const rec = getCase(caseId);
    if (!rec) return c.json({ error: 'not_found' }, 404);
    return c.json(rec);
  });

  app.post('/ops/cases', async (c) => {
    seedDemoCases();
    const body = (await c.req.json()) as CreateCaseBody;
    const assignee = 'base_admin';
    const fp = {
      ...body.fingerprint,
      equipment_type: 'ESS' as const,
      utility_type: deriveUtilityType(body.fingerprint.utility),
    };
    const pack = resolvePack(fp.city, fp.utility);
    const id = Math.random().toString(36).slice(2, 10);
    const rec = {
      id,
      created_at: Date.now(),
      assignee,
      fingerprint: fp,
      pack,
      jobState: pack === 'UNKNOWN_PACK' ? 'UNKNOWN' : 'QUEUED',
      status: pack === 'UNKNOWN_PACK' ? 'UNKNOWN' : 'QUEUED',
      plan: [],
      why: [],
      activationRoute: 'UNKNOWN' as const,
      ...makeActivationState('UNKNOWN', 'AUSTIN_WAIT'),
    };
    saveCase(rec);
    return c.json(rec, 201);
  });

  app.post('/ops/cases/:caseId/plan', async (c) => {
    const { caseId } = c.req.param();
    const updated = await planAndRun(caseId);
    if (!updated) return c.json({ error: 'not_found' }, 404);
    return c.json(updated);
  });

  app.post('/ops/cases/:caseId/activation/events/:eventId/acknowledge', (c) => {
    const rec = getCase(c.req.param('caseId'));
    if (!rec) return c.json({ error: 'not_found' }, 404);
    const event = rec.externalEvents.find((item) => item.id === c.req.param('eventId'));
    if (!event) return c.json({ error: 'event_not_found' }, 404);
    event.acknowledged = true;
    rec.externalEvents.push({ id: `evt_${rec.externalEvents.length + 1}`, type: 'ACKNOWLEDGED', source: event.source, gateKey: event.gateKey, message: `Feedback acknowledged: ${event.message}`, timestamp: Date.now(), acknowledged: true });
    saveCase(rec);
    return c.json(rec);
  });

  app.post('/ops/cases/:caseId/activation/gates/:gateKey/assign', async (c) => {
    const rec = getCase(c.req.param('caseId'));
    if (!rec) return c.json({ error: 'not_found' }, 404);
    const gate = rec.activationGates.find((item) => item.key === c.req.param('gateKey'));
    if (!gate) return c.json({ error: 'gate_not_found' }, 404);
    const body = (await c.req.json()) as { owner?: string };
    if (!body.owner) return c.json({ error: 'owner_required' }, 400);
    gate.owner = body.owner;
    gate.updatedAt = Date.now();
    rec.externalEvents.push({ id: `evt_${rec.externalEvents.length + 1}`, type: 'ASSIGNED', source: gate.source, gateKey: gate.key, message: `${gate.label} assigned to ${body.owner}.`, timestamp: gate.updatedAt, acknowledged: true, assignedOwner: body.owner });
    saveCase(rec);
    return c.json(rec);
  });

  app.post('/ops/cases/:caseId/activation/gates/:gateKey/advance', async (c) => {
    const rec = getCase(c.req.param('caseId'));
    if (!rec) return c.json({ error: 'not_found' }, 404);
    const gate = rec.activationGates.find((item) => item.key === c.req.param('gateKey'));
    if (!gate) return c.json({ error: 'gate_not_found' }, 404);
    const body = (await c.req.json()) as { status?: ActivationGateStatus; message?: string };
    if (!body.status || !allowedGateStatus(gate.status).includes(body.status)) return c.json({ error: 'invalid_status_transition', allowed: allowedGateStatus(gate.status) }, 400);
    const previous = gate.status;
    gate.status = body.status;
    gate.updatedAt = Date.now();
    rec.externalEvents.push({ id: `evt_${rec.externalEvents.length + 1}`, type: 'STATUS_CHANGED', source: gate.source, gateKey: gate.key, message: body.message ?? `${gate.label} moved from ${previous} to ${body.status}.`, timestamp: gate.updatedAt, acknowledged: true, assignedOwner: gate.owner });
    saveCase(rec);
    return c.json(rec);
  });

  app.post('/ops/cases/:caseId/activation/gates/:gateKey/task', (c) => {
    const rec = getCase(c.req.param('caseId'));
    if (!rec) return c.json({ error: 'not_found' }, 404);
    const gate = rec.activationGates.find((item) => item.key === c.req.param('gateKey'));
    if (!gate) return c.json({ error: 'gate_not_found' }, 404);
    const now = Date.now();
    rec.externalEvents.push({ id: `evt_${rec.externalEvents.length + 1}`, type: 'TASK_CREATED', source: gate.source, gateKey: gate.key, message: gate.nextAction ?? gate.issue ?? `Follow up on ${gate.label}.`, timestamp: now, acknowledged: true, assignedOwner: gate.owner });
    gate.updatedAt = now;
    saveCase(rec);
    return c.json(rec);
  });

  // Admin
  app.get('/admin/state', (c) => {
    seedDemoCases();
    const list = listCasesByAssignee();
    return c.json({
      counts: {
        total: list.length,
        byStatus: list.reduce<Record<string, number>>((acc, curr) => {
          acc[curr.status] = (acc[curr.status] ?? 0) + 1;
          return acc;
        }, {}),
      },
    });
  });

  app.post('/admin/reset', (c) => {
    resetStore();
    seedDemoCases();
    return c.json({ ok: true });
  });

  app.post('/admin/toggles', async (c) => {
    const body = (await c.req.json()) as {
      addFireConflictCaseId?: string;
      removeFireConflictCaseId?: string;
    };
    if (body.addFireConflictCaseId) {
      const { store: demoStore } = await import('./store');
      const matches = Array.from(demoStore.casesById.values()).filter((item) =>
        item.id === body.addFireConflictCaseId || item.id.startsWith(body.addFireConflictCaseId!),
      );
      if (matches.length !== 1) {
        return c.json({ error: matches.length === 0 ? 'case_not_found' : 'case_id_ambiguous' }, 400);
      }
      demoStore.toggles.fireConflictCaseIds.add(matches[0].id);
      return c.json({ ok: true, conflictCaseId: matches[0].id });
    }
    if (body.removeFireConflictCaseId) {
      (await import('./store')).store.toggles.fireConflictCaseIds.delete(
        body.removeFireConflictCaseId
      );
    }
    return c.json({ ok: true });
  });

  return app;
}
