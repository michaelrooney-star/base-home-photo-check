export type UtilityType = 'mou' | 'tdu';

export type CaseFingerprint = {
  address: string;
  city: string;
  county: string;
  utility: string;
  property_type: string;
  equipment_type: 'ESS';
  capacity_kwh: number;
  power_kw: number;
  installation: string;
  solar: boolean;
  service_amps: number;
  utility_type: UtilityType; // derived
};

export type CaseStatus = 'OPS_READY' | 'NEEDS_REVIEW' | 'BLOCKED' | 'UNKNOWN' | 'QUEUED';
export type JobState =
  | 'QUEUED'
  | 'PLANNED'
  | 'RUNNING'
  | 'RECONCILING'
  | 'OPS_READY'
  | 'NEEDS_REVIEW'
  | 'BLOCKED'
  | 'UNKNOWN';

export type PackId =
  | 'AUSTIN_RICH'
  | 'ONCOR_SHARED'
  | 'HOUSTON_STUB'
  | 'SANANTONIO_STUB'
  | 'ROUNDROCK_ONCOR'
  | 'DALLAS_ONCOR'
  | 'UNKNOWN_PACK';

export type Citation = {
  label: string;
  url?: string;
  source?: string;
};

export type Finding = {
  domain:
    | 'PERMIT'
    | 'ELECTRICAL'
    | 'FIRE'
    | 'UTILITY_INTERCONNECTION'
    | 'DOCUMENT';
  summary: string;
  citations: Citation[];
  requirement?: 'REQUIRES' | 'NO_REQUIREMENT' | 'UNKNOWN';
  ruleIds?: string[]; // reference into knowledge base
};

export type WorkerResult =
  | {
      status: 'ok';
      findings: Finding[];
      degraded?: boolean;
      attempts: number;
    }
  | {
    status: 'failed';
    error: string;
    attempts: number;
  };

export type PlanNode = {
  id: string;
  wave: 0 | 1 | 2;
  worker: 'resolve_pack' | 'city' | 'electrical' | 'fire' | 'utility_rules' | 'reconcile';
  dependsOn: string[];
  state: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  result?: WorkerResult;
};

export type CaseRecord = {
  id: string;
  created_at: number;
  assignee: string; // ops_maya | ops_sam
  fingerprint: CaseFingerprint;
  pack: PackId;
  jobState: JobState;
  status: CaseStatus;
  degraded: boolean; // fallback used
  plan: PlanNode[];
  why: Finding[]; // reconciled findings
  demoStage?: 'queued' | 'running' | 'ready' | 'review' | 'degraded' | 'blocked' | 'unknown';
};

export type AdminToggles = {
  // If true, utility worker fails and retries up to 2, then falls back to CACHE_VERIFIED_PACK
  killUtilityWorker: boolean;
  // If true, mark specified caseIds to have a FIRE conflict (worker NO_REQUIREMENT vs verified)
  fireConflictCaseIds: Set<string>;
};

export type DemoStore = {
  seeded: boolean;
  casesById: Map<string, CaseRecord>;
  toggles: AdminToggles;
  rulesById?: Map<string, Rule>;
  packToRuleIds?: Map<PackId, string[]>;
};

export type CreateCaseBody = {
  assignee?: string;
  fingerprint: Omit<CaseFingerprint, 'utility_type' | 'equipment_type'> & {
    equipment_type?: 'ESS';
  };
};

export type PlanRequestBody = {
  injectFireConflict?: boolean;
};

export type Relationship =
  | { type: 'REQUIRES'; target_rule_id: string }
  | { type: 'CONFLICTS_WITH'; target_rule_id: string }
  | { type: 'ADOPTS'; target_rule_id: string }
  | { type: 'SUPERSEDES'; target_rule_id: string };

export type Rule = {
  rule_id: string;
  jurisdiction: string; // pack id or state anchor
  domain:
    | 'PERMIT'
    | 'ELECTRICAL'
    | 'FIRE'
    | 'UTILITY_INTERCONNECTION'
    | 'DOCUMENT';
  applies_when: string[];
  requires: string[];
  relationships: Relationship[];
  source: {
    authority: string;
    document?: string;
    section?: string;
    url?: string;
    retrieved_at?: string;
  };
  status: 'verified' | 'candidate' | 'superseded';
};
