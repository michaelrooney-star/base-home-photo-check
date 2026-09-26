import { AdminToggles, CaseRecord, DemoStore, Rule, PackId } from './types';
import { rules as RULES, packIndex } from './data/rules';

const makeToggles = (): AdminToggles => ({
  killUtilityWorker: false,
  fireConflictCaseIds: new Set<string>(),
});

export const store: DemoStore = {
  seeded: false,
  casesById: new Map(),
  toggles: makeToggles(),
  rulesById: undefined,
  packToRuleIds: undefined,
};

export function resetStore() {
  store.seeded = false;
  store.casesById.clear();
  store.toggles = makeToggles();
  store.rulesById = undefined;
  store.packToRuleIds = undefined;
}

export function listCasesByAssignee(assignee?: string): CaseRecord[] {
  const arr = Array.from(store.casesById.values());
  return assignee ? arr.filter((c) => c.assignee === assignee) : arr;
}

export function getCase(caseId: string): CaseRecord | undefined {
  return store.casesById.get(caseId);
}

export function saveCase(rec: CaseRecord): void {
  store.casesById.set(rec.id, rec);
}

export function ensureRulesLoaded() {
  if (!store.rulesById) {
    store.rulesById = new Map<string, Rule>();
    for (const r of RULES) store.rulesById.set(r.rule_id, r);
  }
  if (!store.packToRuleIds) {
    store.packToRuleIds = new Map<PackId, string[]>();
    (Object.keys(packIndex) as PackId[]).forEach((k) => {
      store.packToRuleIds!.set(k, packIndex[k] ?? []);
    });
  }
}
