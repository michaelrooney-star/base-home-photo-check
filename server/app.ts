import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { resetStore, listCasesByAssignee, getCase, saveCase } from './store';
import { seedDemoCases, deriveUtilityType, resolvePack } from './seed';
import { planAndRun } from './runner';
import type { CreateCaseBody } from './types';

export function createApp() {
  const app = new Hono().basePath('/api');
  app.use('*', cors());
  app.use('*', prettyJSON());

  // Health
  app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

  // Seed on first access
  app.get('/ops/queue/:userId', (c) => {
    seedDemoCases();
    const { userId } = c.req.param();
    const list = listCasesByAssignee(userId);
    return c.json({ userId, cases: list });
  });

  app.get('/ops/cases/:caseId', async (c) => {
    const { caseId } = c.req.param();
    let rec = getCase(caseId);
    if (!rec) return c.json({ error: 'not_found' }, 404);
    // M4.5: auto-plan on open if not UNKNOWN and plan is empty
    if (rec.plan.length === 0 && rec.status !== 'UNKNOWN') {
      rec = (await planAndRun(caseId)) ?? rec;
    }
    return c.json(rec);
  });

  app.post('/ops/cases', async (c) => {
    seedDemoCases();
    const body = (await c.req.json()) as CreateCaseBody;
    const assignee = body.assignee ?? 'ops_maya';
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
      degraded: false,
      plan: [],
      why: [],
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
      killUtilityWorker?: boolean;
      addFireConflictCaseId?: string;
      removeFireConflictCaseId?: string;
    };
    if (typeof body.killUtilityWorker === 'boolean') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await import('./store')).store.toggles.killUtilityWorker =
        body.killUtilityWorker;
    }
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
    return c.json({ ok: true, toggles: (await import('./store')).store.toggles.killUtilityWorker });
  });

  return app;
}
