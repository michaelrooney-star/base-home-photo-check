import type { Rule, PackId } from '../types';

// High-level, citation-backed rule anchors (no invented clearances)
export const rules: Rule[] = [
  {
    rule_id: 'austin_permits_general',
    jurisdiction: 'AUSTIN_RICH',
    domain: 'PERMIT',
    applies_when: ['Residential ESS install in City of Austin'],
    requires: ['Building/electrical permits per local process'],
    relationships: [],
    source: {
      authority: 'City of Austin Development Services',
      document: 'Residential permits',
      url: 'https://www.austintexas.gov/department/development-services',
    },
    status: 'verified',
  },
  {
    rule_id: 'austin_fire_guidance',
    jurisdiction: 'AUSTIN_RICH',
    domain: 'FIRE',
    applies_when: ['Stationary energy storage installed within Austin Fire jurisdiction'],
    requires: ['Follow AFD fire code permitting/guidance applicable to ESS'],
    relationships: [],
    source: {
      authority: 'Austin Fire Department',
      document: 'Fire Codes and Permitting',
      url: 'https://www.austintexas.gov/department/fire',
    },
    status: 'verified',
  },
  {
    rule_id: 'austin_energy_interconnection',
    jurisdiction: 'AUSTIN_RICH',
    domain: 'UTILITY_INTERCONNECTION',
    applies_when: ['Austin Energy (municipal utility) serves the address'],
    requires: ['Use Austin Energy interconnection process; city permits separate'],
    relationships: [{ type: 'ADOPTS', target_rule_id: 'sb_1252_mou_anchor' }],
    source: {
      authority: 'Austin Energy',
      document: 'Distributed Generation/Interconnection',
      url: 'https://www.austinenergy.com/',
    },
    status: 'verified',
  },
  {
    rule_id: 'oncor_dg_shared',
    jurisdiction: 'ONCOR_SHARED',
    domain: 'UTILITY_INTERCONNECTION',
    applies_when: ['Oncor TDU territory (e.g., Round Rock, Dallas)'],
    requires: ['PUCT/TAC-aligned DG interconnection; municipal permits handled separately'],
    relationships: [{ type: 'ADOPTS', target_rule_id: 'nec_2023_anchor' }],
    source: {
      authority: 'Oncor',
      document: 'Distributed Generation Interconnection resources',
      url: 'https://www.oncor.com/',
    },
    status: 'verified',
  },
  {
    rule_id: 'houston_ce_permit_stub',
    jurisdiction: 'HOUSTON_STUB',
    domain: 'PERMIT',
    applies_when: ['City of Houston residential ESS'],
    requires: ['Local permitting per City of Houston; details TBD'],
    relationships: [],
    source: {
      authority: 'City of Houston (CE)',
      document: 'Customer Energy/Permitting (general)',
      url: 'https://www.houston.gov/',
    },
    status: 'candidate',
  },
  {
    rule_id: 'cps_energy_ia_stub',
    jurisdiction: 'SANANTONIO_STUB',
    domain: 'UTILITY_INTERCONNECTION',
    applies_when: ['CPS Energy service territory (San Antonio)'],
    requires: ['CPS Energy interconnection and city permitting as applicable'],
    relationships: [],
    source: {
      authority: 'CPS Energy',
      document: 'Interconnection (general)',
      url: 'https://www.cpsenergy.com/',
    },
    status: 'candidate',
  },
  // State anchors
  {
    rule_id: 'nec_2023_anchor',
    jurisdiction: 'STATE_ANCHOR',
    domain: 'ELECTRICAL',
    applies_when: ['Texas adopts/aligns to NEC 2023 via TDLR where applicable'],
    requires: ['Follow NEC 2023 as adopted by local jurisdiction/TDLR'],
    relationships: [],
    source: {
      authority: 'Texas Department of Licensing & Regulation (TDLR)',
      document: 'NEC adoption',
      url: 'https://www.tdlr.texas.gov/',
    },
    status: 'verified',
  },
  {
    rule_id: 'sb_1252_mou_anchor',
    jurisdiction: 'STATE_ANCHOR',
    domain: 'DOCUMENT',
    applies_when: ['Municipal utilities (MOUs) policy context in Texas'],
    requires: ['Recognize exceptions/context for MOUs (policy anchor)'],
    relationships: [],
    source: {
      authority: 'Texas Legislature',
      document: 'SB 1252',
      url: 'https://capitol.texas.gov/',
    },
    status: 'verified',
  },
];

export const packIndex: Record<PackId, string[]> = {
  AUSTIN_RICH: ['austin_permits_general', 'austin_fire_guidance', 'austin_energy_interconnection', 'nec_2023_anchor', 'sb_1252_mou_anchor'],
  ROUNDROCK_ONCOR: ['oncor_dg_shared', 'nec_2023_anchor'],
  DALLAS_ONCOR: ['oncor_dg_shared', 'nec_2023_anchor'],
  HOUSTON_STUB: ['houston_ce_permit_stub', 'nec_2023_anchor'],
  SANANTONIO_STUB: ['cps_energy_ia_stub', 'nec_2023_anchor'],
  UNKNOWN_PACK: [],
};
