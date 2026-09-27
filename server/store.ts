import { AdminToggles, CaseRecord, DemoStore } from './types';

const makeToggles = (): AdminToggles => ({
  fireConflictCaseIds: new Set<string>(),
});

export const store: DemoStore = {
  seeded: false,
  casesById: new Map(),
  toggles: makeToggles(),
};

export function resetStore() {
  store.seeded = false;
  store.casesById.clear();
  store.toggles = makeToggles();
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
