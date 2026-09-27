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

export type CaseStatus = 'QUEUED' | 'OPS_READY' | 'NEEDS_REVIEW' | 'BLOCKED' | 'UNKNOWN';
export type OperationalStatus = 'OPERATIONAL' | 'WAITING' | 'BLOCKED';
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

export type ActivationRoute = 'AUSTIN_UTILITY_MANAGED' | 'ERCOT_ADER' | 'BOTH' | 'UNKNOWN';
export type ActivationGateKey =
  | 'AUSTIN_INSPECTION'
  | 'INTERCONNECTION_PTO'
  | 'ERCOT_REGISTRATION'
  | 'TELEMETRY'
  | 'DISPATCH_QUALIFICATION'
  | 'ANCILLARY_SERVICES';
export type ActivationSource = 'AUSTIN_ENERGY' | 'ERCOT' | 'INSTALLER' | 'QSE' | 'CUSTOMER';
export type ActivationGateStatus = 'NOT_STARTED' | 'SUBMITTED' | 'QUESTIONS' | 'FAILED' | 'ACCEPTED';
export type ExternalEventType = 'FEEDBACK' | 'ACKNOWLEDGED' | 'ASSIGNED' | 'TASK_CREATED' | 'STATUS_CHANGED';

export type ActivationGate = {
  key: ActivationGateKey;
  label: string;
  source: ActivationSource;
  status: ActivationGateStatus;
  owner?: string;
  dueAt?: number;
  externalRef?: string;
  issue?: string;
  nextAction?: string;
  updatedAt: number;
};

export type ExternalEvent = {
  id: string;
  type: ExternalEventType;
  source: ActivationSource;
  message: string;
  timestamp: number;
  gateKey?: ActivationGateKey;
  acknowledged: boolean;
  assignedOwner?: string;
};

export type ActivationSummary = {
  route: ActivationRoute;
  currentGate?: ActivationGateKey;
  currentLabel?: string;
  source?: ActivationSource;
  status?: ActivationGateStatus;
  owner?: string;
  overdue: boolean;
  correctionNeeded: boolean;
  awaitingExternal: boolean;
  telemetryPending: boolean;
  dispatchReady: boolean;
  latestResponse?: string;
  latestResponseSource?: ActivationSource;
};

export type FollowUpContact = {
  organization: string;
  name: string;
  email?: string;
  phone?: string;
  url?: string;
  note?: string;
};

export type Citation = {
  label: string;
  url?: string;
  source?: string;
};

export type SitePhoto = {
  id: string;
  title: string;
  src: string;
  note: string;
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
  ruleIds?: string[];
};

export type Relationship =
  | { type: 'REQUIRES'; target_rule_id: string }
  | { type: 'CONFLICTS_WITH'; target_rule_id: string }
  | { type: 'ADOPTS'; target_rule_id: string }
  | { type: 'SUPERSEDES'; target_rule_id: string };

export type Rule = {
  rule_id: string;
  jurisdiction: string;
  domain: Finding['domain'];
  applies_when: string[];
  requires: string[];
  relationships: Relationship[];
  source: { authority: string; document?: string; section?: string; url?: string; retrieved_at?: string };
  status: 'verified' | 'candidate' | 'superseded';
};

export type WorkerResult =
  | {
      status: 'ok';
      findings: Finding[];
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
  assignee: string; // base_admin for the single-admin demo
  fingerprint: CaseFingerprint;
  pack: PackId;
  jobState: JobState;
  status: CaseStatus;
  plan: PlanNode[];
  why: Finding[]; // reconciled findings
  sitePhotos?: SitePhoto[];
  activationRoute: ActivationRoute;
  activationGates: ActivationGate[];
  externalEvents: ExternalEvent[];
  followUpContact?: FollowUpContact;
};

export type AdminToggles = {
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
