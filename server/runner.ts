import { store, getCase, saveCase } from './store';
import {
  CaseRecord,
  Finding,
  PlanNode,
  WorkerResult,
} from './types';

// Simulated workers
async function runResolvePack(caseRec: CaseRecord): Promise<WorkerResult> {
  return {
    status: 'ok',
    findings: caseRec.why, // seed-level pack findings (includes ruleIds)
    attempts: 1,
  };
}

async function runCityWorker(_: CaseRecord): Promise<WorkerResult> {
  return {
    status: 'ok',
    findings: [],
    attempts: 1,
  };
}

async function runElectricalWorker(_: CaseRecord): Promise<WorkerResult> {
  return {
    status: 'ok',
    findings: [],
    attempts: 1,
  };
}

async function runFireWorker(caseRec: CaseRecord): Promise<WorkerResult> {
  const conflict =
    store.toggles.fireConflictCaseIds.has(caseRec.id) ? true : false;
  if (conflict) {
    return {
      status: 'ok',
      findings: [
        {
          domain: 'FIRE',
          summary:
            'Worker returned NO_REQUIREMENT but verified graph indicates requirements exist.',
          citations: [],
          requirement: 'NO_REQUIREMENT',
          ruleIds: ['austin_fire_guidance'],
        },
      ],
      attempts: 1,
    };
  }
  return {
    status: 'ok',
    findings: [
      {
        domain: 'FIRE',
        summary: 'Fire code requirements likely apply; verify against current local adoption.',
        citations: [],
        requirement: 'REQUIRES',
        ruleIds: ['austin_fire_guidance'],
      },
    ],
    attempts: 1,
  };
}

async function runUtilityWorker(caseRec: CaseRecord): Promise<WorkerResult> {
  // Inject failure path: kill + retry twice then fallback to CACHE_VERIFIED_PACK
  let attempts = 0;
  if (store.toggles.killUtilityWorker) {
    while (attempts < 2) {
      attempts++;
      await new Promise((r) => setTimeout(r, 150));
    }
    return {
      status: 'failed',
      error: 'Injected utility worker failure',
      attempts,
    };
  }
  return {
    status: 'ok',
    findings: [],
    attempts: 1,
  };
}

function makePlan(caseId: string): PlanNode[] {
  return [
    {
      id: 'n0_resolve_pack',
      wave: 0,
      worker: 'resolve_pack',
      dependsOn: [],
      state: 'PENDING',
    },
    {
      id: 'n1_city',
      wave: 1,
      worker: 'city',
      dependsOn: ['n0_resolve_pack'],
      state: 'PENDING',
    },
    {
      id: 'n1_electrical',
      wave: 1,
      worker: 'electrical',
      dependsOn: ['n0_resolve_pack'],
      state: 'PENDING',
    },
    {
      id: 'n1_fire',
      wave: 1,
      worker: 'fire',
      dependsOn: ['n0_resolve_pack'],
      state: 'PENDING',
    },
    {
      id: 'n1_utility_rules',
      wave: 1,
      worker: 'utility_rules',
      dependsOn: ['n0_resolve_pack'],
      state: 'PENDING',
    },
    {
      id: 'n2_reconcile',
      wave: 2,
      worker: 'reconcile',
      dependsOn: ['n1_city', 'n1_electrical', 'n1_fire', 'n1_utility_rules'],
      state: 'PENDING',
    },
  ];
}

export async function planAndRun(caseId: string): Promise<CaseRecord | undefined> {
  const rec = getCase(caseId);
  if (!rec) return undefined;

  rec.jobState = 'PLANNED';
  rec.plan = makePlan(caseId);
  saveCase(rec);

  rec.jobState = 'RUNNING';
  saveCase(rec);

  // Wave 0
  const n0 = rec.plan.find((n) => n.id === 'n0_resolve_pack')!;
  n0.state = 'RUNNING';
  n0.result = await runResolvePack(rec);
  n0.state = 'DONE';
  saveCase(rec);

  // Wave 1 in parallel
  const wave1 = rec.plan.filter((n) => n.wave === 1);
  await Promise.allSettled(
    wave1.map(async (node) => {
      node.state = 'RUNNING';
      let result: WorkerResult;
      switch (node.worker) {
        case 'city':
          result = await runCityWorker(rec);
          break;
        case 'electrical':
          result = await runElectricalWorker(rec);
          break;
        case 'fire':
          result = await runFireWorker(rec);
          break;
        case 'utility_rules':
          result = await runUtilityWorker(rec);
          break;
        default:
          result = { status: 'failed', error: 'Unknown worker', attempts: 1 };
      }
      node.result = result;
      node.state = result.status === 'ok' ? 'DONE' : 'FAILED';
    })
  );
  saveCase(rec);

  // Wave 2 reconcile
  const n2 = rec.plan.find((n) => n.worker === 'reconcile')!;
  n2.state = 'RUNNING';
  rec.jobState = 'RECONCILING';

  // Reconcile logic
  const findings: Finding[] = [];
  let hasFailure = false;
  let needsReview = false;
  let degraded = false;

  for (const node of wave1) {
    if (node.result?.status === 'failed') {
      if (node.worker === 'utility_rules') {
        // Fallback allowed: use CACHE_VERIFIED_PACK
        degraded = true;
      } else {
        hasFailure = true;
      }
    }
    if (node.result?.status === 'ok') {
      findings.push(...(node.result.findings ?? []));
      if (
        node.worker === 'fire' &&
        node.result.findings.some((f) => f.domain === 'FIRE' && f.requirement === 'NO_REQUIREMENT')
      ) {
        // Conflict with base verified pack assumption: flag needs review
        needsReview = true;
      }
    }
  }

  rec.degraded = degraded;
  rec.why = [...(rec.why ?? []), ...findings];

  if (rec.pack === 'UNKNOWN_PACK') {
    rec.jobState = 'UNKNOWN';
    rec.status = 'UNKNOWN';
  } else if (needsReview) {
    rec.jobState = 'NEEDS_REVIEW';
    rec.status = 'NEEDS_REVIEW';
  } else if (hasFailure) {
    rec.jobState = 'BLOCKED';
    rec.status = 'BLOCKED';
  } else {
    rec.jobState = 'OPS_READY';
    rec.status = 'OPS_READY';
  }

  n2.state = 'DONE';
  saveCase(rec);
  return rec;
}
