// Demo data for Microplanning — automatically hidden when real entries exist

export interface DemoMicroplanEntry {
  id: string;
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  flhf_incharge_name: string;
  flhf_incharge_phone: string;
  community_name: string;
  community_leader_name: string;
  community_leader_phone: string;
  settlement_name: string | null;
  settlement_mai_unguwa: string | null;
  community_distance_to_flhf_km: number | null;
  settlement_distance_to_flhf_km: number | null;
  terrain_type: string;
  accessibility: string;
  security_clearance: string;
  estimated_total_population: number;
  estimated_children_0_4: number;
  estimated_children_5_14: number;
  estimated_adults_15_plus: number;
  number_of_households: number;
  trachoma_0_5_months: number | null;
  trachoma_6m_6y: number | null;
  trachoma_7_14y: number | null;
  trachoma_15_plus: number | null;
  cdd_names: string;
  cdd_phone_numbers: string;
  cdd_from_community: boolean;
  community_latitude: number;
  community_longitude: number;
  flhf_latitude: number;
  flhf_longitude: number;
  settlement_latitude: number | null;
  settlement_longitude: number | null;
  campaign_type: string;
  population_source: string;
  year_of_microplanning: number;
  notes: string | null;
  status: string;
  created_at: string;
  _isDemo?: boolean;
}

const d = (id: string, rest: Omit<DemoMicroplanEntry, "id" | "_isDemo" | "created_at" | "status">): DemoMicroplanEntry => ({
  id,
  ...rest,
  status: "approved",
  created_at: new Date().toISOString(),
  _isDemo: true,
});

export const DEMO_ENTRIES: DemoMicroplanEntry[] = [
  // === KANO STATE ===
  d("demo-001", {
    state: "Kano", lga: "Nassarawa", ward: "Gwale",
    flhf_name: "Nassarawa PHC", flhf_incharge_name: "Amina Yusuf", flhf_incharge_phone: "08012345678",
    community_name: "Unguwar Diko", community_leader_name: "Alhaji Musa Diko", community_leader_phone: "08098765432",
    settlement_name: "Diko Settlement A", settlement_mai_unguwa: "Mai Unguwa Sani",
    community_distance_to_flhf_km: 1.2, settlement_distance_to_flhf_km: 1.8,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 3250, estimated_children_0_4: 650, estimated_children_5_14: 812, estimated_adults_15_plus: 1788,
    number_of_households: 540, trachoma_0_5_months: 120, trachoma_6m_6y: 530, trachoma_7_14y: 812, trachoma_15_plus: 1788,
    cdd_names: "Fatima Bello, Ibrahim Garba", cdd_phone_numbers: "08011111111, 08022222222", cdd_from_community: true,
    community_latitude: 12.0022, community_longitude: 8.5167, flhf_latitude: 11.9980, flhf_longitude: 8.5200,
    settlement_latitude: 12.0050, settlement_longitude: 8.5190,
    campaign_type: "ntd", population_source: "Census Projection", year_of_microplanning: 2026, notes: null,
  }),
  d("demo-002", {
    state: "Kano", lga: "Nassarawa", ward: "Gwale",
    flhf_name: "Nassarawa PHC", flhf_incharge_name: "Amina Yusuf", flhf_incharge_phone: "08012345678",
    community_name: "Unguwar Rimi", community_leader_name: "Alhaji Abdullahi Rimi", community_leader_phone: "08033344455",
    settlement_name: "Rimi East", settlement_mai_unguwa: "Mai Unguwa Bala",
    community_distance_to_flhf_km: 2.5, settlement_distance_to_flhf_km: 3.1,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 4800, estimated_children_0_4: 960, estimated_children_5_14: 1200, estimated_adults_15_plus: 2640,
    number_of_households: 800, trachoma_0_5_months: 180, trachoma_6m_6y: 780, trachoma_7_14y: 1200, trachoma_15_plus: 2640,
    cdd_names: "Hauwa Suleiman", cdd_phone_numbers: "08055566677", cdd_from_community: true,
    community_latitude: 12.0150, community_longitude: 8.5300, flhf_latitude: 11.9980, flhf_longitude: 8.5200,
    settlement_latitude: 12.0180, settlement_longitude: 8.5330,
    campaign_type: "ntd", population_source: "Household Listing", year_of_microplanning: 2026, notes: null,
  }),
  d("demo-003", {
    state: "Kano", lga: "Ungogo", ward: "Rangaza",
    flhf_name: "Ungogo General Hospital", flhf_incharge_name: "Dr. Bello Ahmed", flhf_incharge_phone: "08044455566",
    community_name: "Rangaza Community", community_leader_name: "Sarkin Gari Malam Isa", community_leader_phone: "08077788899",
    settlement_name: null, settlement_mai_unguwa: null,
    community_distance_to_flhf_km: 5.3, settlement_distance_to_flhf_km: null,
    terrain_type: "flat", accessibility: "hard_to_reach", security_clearance: "cleared",
    estimated_total_population: 2100, estimated_children_0_4: 420, estimated_children_5_14: 525, estimated_adults_15_plus: 1155,
    number_of_households: 350, trachoma_0_5_months: null, trachoma_6m_6y: null, trachoma_7_14y: null, trachoma_15_plus: null,
    cdd_names: "Abubakar Sadiq", cdd_phone_numbers: "08099900011", cdd_from_community: false,
    community_latitude: 12.0800, community_longitude: 8.4900, flhf_latitude: 12.0550, flhf_longitude: 8.4750,
    settlement_latitude: null, settlement_longitude: null,
    campaign_type: "ntd", population_source: "Estimated", year_of_microplanning: 2026, notes: "River crossing needed during rainy season",
  }),

  // === KADUNA STATE ===
  d("demo-004", {
    state: "Kaduna", lga: "Zaria", ward: "Tudun Wada",
    flhf_name: "Tudun Wada PHC", flhf_incharge_name: "Hajia Zainab Musa", flhf_incharge_phone: "08055512345",
    community_name: "Tudun Wada Central", community_leader_name: "Magajin Gari Aliyu", community_leader_phone: "08066623456",
    settlement_name: "Angwan Shanu", settlement_mai_unguwa: "Mai Unguwa Danladi",
    community_distance_to_flhf_km: 0.8, settlement_distance_to_flhf_km: 1.4,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 5600, estimated_children_0_4: 1120, estimated_children_5_14: 1400, estimated_adults_15_plus: 3080,
    number_of_households: 933, trachoma_0_5_months: 210, trachoma_6m_6y: 910, trachoma_7_14y: 1400, trachoma_15_plus: 3080,
    cdd_names: "Jamilu Hassan, Rahinatu Bello, Garba Yusuf", cdd_phone_numbers: "08011100022, 08033300044, 08055500066", cdd_from_community: true,
    community_latitude: 11.0850, community_longitude: 7.7100, flhf_latitude: 11.0820, flhf_longitude: 7.7080,
    settlement_latitude: 11.0870, settlement_longitude: 7.7130,
    campaign_type: "ntd", population_source: "Census Projection", year_of_microplanning: 2026, notes: null,
  }),
  d("demo-005", {
    state: "Kaduna", lga: "Igabi", ward: "Turunku",
    flhf_name: "Turunku Health Post", flhf_incharge_name: "Mallam Idris Sani", flhf_incharge_phone: "08077712345",
    community_name: "Turunku Village", community_leader_name: "Village Head Tanko", community_leader_phone: "08088823456",
    settlement_name: "Turunku Nomadic", settlement_mai_unguwa: "Mai Angwa Shehu",
    community_distance_to_flhf_km: 8.5, settlement_distance_to_flhf_km: 12.0,
    terrain_type: "hilly", accessibility: "hard_to_reach", security_clearance: "partial",
    estimated_total_population: 1800, estimated_children_0_4: 360, estimated_children_5_14: 450, estimated_adults_15_plus: 990,
    number_of_households: 300, trachoma_0_5_months: 65, trachoma_6m_6y: 295, trachoma_7_14y: 450, trachoma_15_plus: 990,
    cdd_names: "Yusuf Abdullahi", cdd_phone_numbers: "08099934567", cdd_from_community: true,
    community_latitude: 10.8500, community_longitude: 7.5800, flhf_latitude: 10.8350, flhf_longitude: 7.5650,
    settlement_latitude: 10.8600, settlement_longitude: 7.5900,
    campaign_type: "trachoma", population_source: "Household Listing", year_of_microplanning: 2026, notes: "Nomadic settlement — population fluctuates seasonally",
  }),

  // === BORNO STATE ===
  d("demo-006", {
    state: "Borno", lga: "Maiduguri", ward: "Bolori I",
    flhf_name: "Bolori PHC", flhf_incharge_name: "Dr. Fatima Bukar", flhf_incharge_phone: "08033345678",
    community_name: "Bolori Layout", community_leader_name: "Bulama Aji Kolo", community_leader_phone: "08044456789",
    settlement_name: "IDP Camp Extension", settlement_mai_unguwa: "Camp Leader Mohammed",
    community_distance_to_flhf_km: 0.5, settlement_distance_to_flhf_km: 1.0,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 8200, estimated_children_0_4: 1640, estimated_children_5_14: 2050, estimated_adults_15_plus: 4510,
    number_of_households: 1366, trachoma_0_5_months: 310, trachoma_6m_6y: 1330, trachoma_7_14y: 2050, trachoma_15_plus: 4510,
    cdd_names: "Aisha Grema, Bukar Ali, Modu Baba", cdd_phone_numbers: "08055567890, 08066678901, 08077789012", cdd_from_community: true,
    community_latitude: 11.8400, community_longitude: 13.1500, flhf_latitude: 11.8380, flhf_longitude: 13.1480,
    settlement_latitude: 11.8420, settlement_longitude: 13.1530,
    campaign_type: "ntd", population_source: "IDP Registration", year_of_microplanning: 2026, notes: "High density IDP settlement — requires additional CDDs",
  }),
  d("demo-007", {
    state: "Borno", lga: "Jere", ward: "Dusuman",
    flhf_name: "Dusuman Dispensary", flhf_incharge_name: "Nurse Kaka Maina", flhf_incharge_phone: "08088890123",
    community_name: "Dusuman Village", community_leader_name: "Lawan Bukar Goni", community_leader_phone: "08099901234",
    settlement_name: null, settlement_mai_unguwa: null,
    community_distance_to_flhf_km: 15.0, settlement_distance_to_flhf_km: null,
    terrain_type: "desert", accessibility: "inaccessible", security_clearance: "not_cleared",
    estimated_total_population: 950, estimated_children_0_4: 190, estimated_children_5_14: 237, estimated_adults_15_plus: 523,
    number_of_households: 158, trachoma_0_5_months: null, trachoma_6m_6y: null, trachoma_7_14y: null, trachoma_15_plus: null,
    cdd_names: "—", cdd_phone_numbers: "—", cdd_from_community: false,
    community_latitude: 11.7200, community_longitude: 13.2800, flhf_latitude: 11.7600, flhf_longitude: 13.2400,
    settlement_latitude: null, settlement_longitude: null,
    campaign_type: "ntd", population_source: "Estimated", year_of_microplanning: 2026, notes: "Security concern — armed group activity reported in area",
  }),

  // === SOKOTO STATE ===
  d("demo-008", {
    state: "Sokoto", lga: "Sokoto South", ward: "Gagi",
    flhf_name: "Gagi Health Centre", flhf_incharge_name: "Mallam Usman Aliyu", flhf_incharge_phone: "08011122233",
    community_name: "Gagi Community", community_leader_name: "Sarkin Gagi Abubakar", community_leader_phone: "08022233344",
    settlement_name: "Gagi Riverine", settlement_mai_unguwa: "Mai Unguwa Rabe",
    community_distance_to_flhf_km: 2.0, settlement_distance_to_flhf_km: 4.5,
    terrain_type: "riverine", accessibility: "seasonal", security_clearance: "cleared",
    estimated_total_population: 3800, estimated_children_0_4: 760, estimated_children_5_14: 950, estimated_adults_15_plus: 2090,
    number_of_households: 633, trachoma_0_5_months: 140, trachoma_6m_6y: 620, trachoma_7_14y: 950, trachoma_15_plus: 2090,
    cdd_names: "Bilkisu Umar, Musa Shehu", cdd_phone_numbers: "08033344455, 08044455566", cdd_from_community: true,
    community_latitude: 13.0500, community_longitude: 5.2300, flhf_latitude: 13.0480, flhf_longitude: 5.2280,
    settlement_latitude: 13.0530, settlement_longitude: 5.2350,
    campaign_type: "trachoma", population_source: "Census Projection", year_of_microplanning: 2026, notes: "Flooding during July-Sept makes access difficult",
  }),

  // === KEBBI STATE ===
  d("demo-009", {
    state: "Kebbi", lga: "Birnin Kebbi", ward: "Ambursa",
    flhf_name: "Ambursa PHC", flhf_incharge_name: "Hajiya Hadiza Kebbi", flhf_incharge_phone: "08055566677",
    community_name: "Ambursa Town", community_leader_name: "District Head Abubakar", community_leader_phone: "08066677788",
    settlement_name: "Ambursa Farming", settlement_mai_unguwa: "Mai Unguwa Garba",
    community_distance_to_flhf_km: 0.3, settlement_distance_to_flhf_km: 2.8,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 6500, estimated_children_0_4: 1300, estimated_children_5_14: 1625, estimated_adults_15_plus: 3575,
    number_of_households: 1083, trachoma_0_5_months: 240, trachoma_6m_6y: 1060, trachoma_7_14y: 1625, trachoma_15_plus: 3575,
    cdd_names: "Halima Bello, Usman Daniya, Rabi Abubakar", cdd_phone_numbers: "08077788899, 08088899900, 08099900011", cdd_from_community: true,
    community_latitude: 12.4500, community_longitude: 4.1900, flhf_latitude: 12.4480, flhf_longitude: 4.1880,
    settlement_latitude: 12.4550, settlement_longitude: 4.1950,
    campaign_type: "ntd", population_source: "Household Listing", year_of_microplanning: 2026, notes: null,
  }),

  // === ZAMFARA STATE ===
  d("demo-010", {
    state: "Zamfara", lga: "Gusau", ward: "Tudun Wada",
    flhf_name: "Tudun Wada Clinic", flhf_incharge_name: "Nurse Asabe Lawal", flhf_incharge_phone: "08011133344",
    community_name: "Tudun Wada Gusau", community_leader_name: "Hakimin Tudun Wada", community_leader_phone: "08022244455",
    settlement_name: null, settlement_mai_unguwa: null,
    community_distance_to_flhf_km: 1.0, settlement_distance_to_flhf_km: null,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "partial",
    estimated_total_population: 4200, estimated_children_0_4: 840, estimated_children_5_14: 1050, estimated_adults_15_plus: 2310,
    number_of_households: 700, trachoma_0_5_months: 155, trachoma_6m_6y: 685, trachoma_7_14y: 1050, trachoma_15_plus: 2310,
    cdd_names: "Maryam Hassan", cdd_phone_numbers: "08033355566", cdd_from_community: true,
    community_latitude: 12.1700, community_longitude: 6.6600, flhf_latitude: 12.1680, flhf_longitude: 6.6580,
    settlement_latitude: null, settlement_longitude: null,
    campaign_type: "ntd", population_source: "Census Projection", year_of_microplanning: 2026, notes: "Security escort sometimes needed for outreach teams",
  }),

  // === NIGER STATE ===
  d("demo-011", {
    state: "Niger", lga: "Kontagora", ward: "Kontagora Central",
    flhf_name: "Kontagora General Hospital", flhf_incharge_name: "Dr. Aisha Ndagi", flhf_incharge_phone: "08044466677",
    community_name: "Magama Community", community_leader_name: "Chief Ndaman Magama", community_leader_phone: "08055577788",
    settlement_name: "Magama South", settlement_mai_unguwa: "Mai Unguwa Yahuza",
    community_distance_to_flhf_km: 6.0, settlement_distance_to_flhf_km: 7.5,
    terrain_type: "hilly", accessibility: "hard_to_reach", security_clearance: "partial",
    estimated_total_population: 2800, estimated_children_0_4: 560, estimated_children_5_14: 700, estimated_adults_15_plus: 1540,
    number_of_households: 466, trachoma_0_5_months: null, trachoma_6m_6y: null, trachoma_7_14y: null, trachoma_15_plus: null,
    cdd_names: "Ibrahim Kontagora, Hadiza Waziri", cdd_phone_numbers: "08066688899, 08077799900", cdd_from_community: false,
    community_latitude: 10.4000, community_longitude: 5.4700, flhf_latitude: 10.3950, flhf_longitude: 5.4600,
    settlement_latitude: 10.4050, settlement_longitude: 5.4750,
    campaign_type: "trachoma", population_source: "Estimated", year_of_microplanning: 2026, notes: "Hilly terrain requires motorbike transport",
  }),

  // === NASARAWA STATE ===
  d("demo-012", {
    state: "Nasarawa", lga: "Lafia", ward: "Chiroma",
    flhf_name: "Chiroma PHC", flhf_incharge_name: "Mrs. Grace Okpanachi", flhf_incharge_phone: "08088800011",
    community_name: "Chiroma Village", community_leader_name: "Chief Samuel Adamu", community_leader_phone: "08099911122",
    settlement_name: "Chiroma Extension", settlement_mai_unguwa: "Mai Angwan Peter",
    community_distance_to_flhf_km: 3.2, settlement_distance_to_flhf_km: 4.0,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 3100, estimated_children_0_4: 620, estimated_children_5_14: 775, estimated_adults_15_plus: 1705,
    number_of_households: 516, trachoma_0_5_months: 115, trachoma_6m_6y: 505, trachoma_7_14y: 775, trachoma_15_plus: 1705,
    cdd_names: "Blessing Okoh, Daniel Adamu", cdd_phone_numbers: "08011122233, 08022233344", cdd_from_community: true,
    community_latitude: 8.4900, community_longitude: 8.5200, flhf_latitude: 8.4850, flhf_longitude: 8.5150,
    settlement_latitude: 8.4950, settlement_longitude: 8.5250,
    campaign_type: "ntd", population_source: "Household Listing", year_of_microplanning: 2026, notes: null,
  }),

  // === PLATEAU STATE ===
  d("demo-013", {
    state: "Plateau", lga: "Jos South", ward: "Bukuru",
    flhf_name: "Bukuru Health Centre", flhf_incharge_name: "Mrs. Deborah Danladi", flhf_incharge_phone: "08033344455",
    community_name: "Bukuru Town", community_leader_name: "Da Gwom Bukuru", community_leader_phone: "08044455566",
    settlement_name: "Bukuru Mining Area", settlement_mai_unguwa: "Mai Angwan Mining",
    community_distance_to_flhf_km: 1.5, settlement_distance_to_flhf_km: 3.0,
    terrain_type: "mountainous", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 7200, estimated_children_0_4: 1440, estimated_children_5_14: 1800, estimated_adults_15_plus: 3960,
    number_of_households: 1200, trachoma_0_5_months: 270, trachoma_6m_6y: 1170, trachoma_7_14y: 1800, trachoma_15_plus: 3960,
    cdd_names: "Nankap Joshua, Ruth Mangut, Zang Danlami", cdd_phone_numbers: "08055566677, 08066677788, 08077788899", cdd_from_community: true,
    community_latitude: 9.7900, community_longitude: 8.8600, flhf_latitude: 9.7880, flhf_longitude: 8.8580,
    settlement_latitude: 9.7950, settlement_longitude: 8.8650,
    campaign_type: "ntd", population_source: "Census Projection", year_of_microplanning: 2026, notes: null,
  }),

  // === TARABA STATE ===
  d("demo-014", {
    state: "Taraba", lga: "Jalingo", ward: "Barade",
    flhf_name: "Barade PHC", flhf_incharge_name: "Mr. Silas Wakili", flhf_incharge_phone: "08088899900",
    community_name: "Barade Community", community_leader_name: "Arnado Barade", community_leader_phone: "08099900011",
    settlement_name: "Barade Fishing", settlement_mai_unguwa: "Mai Angwan Idi",
    community_distance_to_flhf_km: 4.0, settlement_distance_to_flhf_km: 6.2,
    terrain_type: "riverine", accessibility: "seasonal", security_clearance: "cleared",
    estimated_total_population: 2400, estimated_children_0_4: 480, estimated_children_5_14: 600, estimated_adults_15_plus: 1320,
    number_of_households: 400, trachoma_0_5_months: null, trachoma_6m_6y: null, trachoma_7_14y: null, trachoma_15_plus: null,
    cdd_names: "Comfort Idi", cdd_phone_numbers: "08011100022", cdd_from_community: true,
    community_latitude: 8.8900, community_longitude: 11.3600, flhf_latitude: 8.8850, flhf_longitude: 11.3550,
    settlement_latitude: 8.8950, settlement_longitude: 11.3650,
    campaign_type: "ntd", population_source: "Estimated", year_of_microplanning: 2026, notes: "Benue River crossing — inaccessible Aug-Oct",
  }),

  // === CROSS RIVER STATE ===
  d("demo-015", {
    state: "Cross River", lga: "Calabar South", ward: "Anantigha",
    flhf_name: "Anantigha Health Post", flhf_incharge_name: "Nurse Ekanem Bassey", flhf_incharge_phone: "08022211122",
    community_name: "Anantigha Fishing Village", community_leader_name: "Chief Effiong Bassey", community_leader_phone: "08033322233",
    settlement_name: null, settlement_mai_unguwa: null,
    community_distance_to_flhf_km: 0.5, settlement_distance_to_flhf_km: null,
    terrain_type: "swampy", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 1600, estimated_children_0_4: 320, estimated_children_5_14: 400, estimated_adults_15_plus: 880,
    number_of_households: 266, trachoma_0_5_months: 60, trachoma_6m_6y: 260, trachoma_7_14y: 400, trachoma_15_plus: 880,
    cdd_names: "Mary Okon, Okon Edet", cdd_phone_numbers: "08044433344, 08055544455", cdd_from_community: true,
    community_latitude: 4.9500, community_longitude: 8.3200, flhf_latitude: 4.9490, flhf_longitude: 8.3190,
    settlement_latitude: null, settlement_longitude: null,
    campaign_type: "ntd", population_source: "Household Listing", year_of_microplanning: 2026, notes: null,
  }),

  // === ADAMAWA STATE ===
  d("demo-016", {
    state: "Adamawa", lga: "Yola North", ward: "Jimeta",
    flhf_name: "Jimeta PHC", flhf_incharge_name: "Dr. Patience Bulus", flhf_incharge_phone: "08066655566",
    community_name: "Jimeta Community", community_leader_name: "Jauro Jimeta", community_leader_phone: "08077766677",
    settlement_name: "Jimeta Riverside", settlement_mai_unguwa: "Mai Angwan River",
    community_distance_to_flhf_km: 1.0, settlement_distance_to_flhf_km: 2.5,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 5100, estimated_children_0_4: 1020, estimated_children_5_14: 1275, estimated_adults_15_plus: 2805,
    number_of_households: 850, trachoma_0_5_months: 190, trachoma_6m_6y: 830, trachoma_7_14y: 1275, trachoma_15_plus: 2805,
    cdd_names: "Adamu Bello, Laraba Yusuf", cdd_phone_numbers: "08088877788, 08099988899", cdd_from_community: true,
    community_latitude: 9.2800, community_longitude: 12.4600, flhf_latitude: 9.2780, flhf_longitude: 12.4580,
    settlement_latitude: 9.2830, settlement_longitude: 12.4630,
    campaign_type: "ntd", population_source: "Census Projection", year_of_microplanning: 2026, notes: null,
  }),

  // === GOMBE STATE ===
  d("demo-017", {
    state: "Gombe", lga: "Gombe", ward: "Herwagana",
    flhf_name: "Herwagana Health Centre", flhf_incharge_name: "Mallam Adamu Gombe", flhf_incharge_phone: "08011144455",
    community_name: "Herwagana Village", community_leader_name: "Sarkin Herwagana", community_leader_phone: "08022255566",
    settlement_name: "Herwagana Farmland", settlement_mai_unguwa: "Mai Unguwa Farming",
    community_distance_to_flhf_km: 7.0, settlement_distance_to_flhf_km: 9.5,
    terrain_type: "hilly", accessibility: "hard_to_reach", security_clearance: "cleared",
    estimated_total_population: 1950, estimated_children_0_4: 390, estimated_children_5_14: 487, estimated_adults_15_plus: 1073,
    number_of_households: 325, trachoma_0_5_months: null, trachoma_6m_6y: null, trachoma_7_14y: null, trachoma_15_plus: null,
    cdd_names: "Suleiman Baba", cdd_phone_numbers: "08033366677", cdd_from_community: true,
    community_latitude: 10.2800, community_longitude: 11.1700, flhf_latitude: 10.2700, flhf_longitude: 11.1600,
    settlement_latitude: 10.2850, settlement_longitude: 11.1750,
    campaign_type: "trachoma", population_source: "Estimated", year_of_microplanning: 2026, notes: "Poor road infrastructure — motorbike access only",
  }),

  // === BAUCHI STATE ===
  d("demo-018", {
    state: "Bauchi", lga: "Bauchi", ward: "Hardo",
    flhf_name: "Hardo PHC", flhf_incharge_name: "Nurse Halima Bako", flhf_incharge_phone: "08044477788",
    community_name: "Hardo Community", community_leader_name: "Hakimi Hardo", community_leader_phone: "08055588899",
    settlement_name: null, settlement_mai_unguwa: null,
    community_distance_to_flhf_km: 3.5, settlement_distance_to_flhf_km: null,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 3400, estimated_children_0_4: 680, estimated_children_5_14: 850, estimated_adults_15_plus: 1870,
    number_of_households: 566, trachoma_0_5_months: 125, trachoma_6m_6y: 555, trachoma_7_14y: 850, trachoma_15_plus: 1870,
    cdd_names: "Aisha Mohammed, Bala Yunusa", cdd_phone_numbers: "08066699900, 08077700011", cdd_from_community: true,
    community_latitude: 10.3100, community_longitude: 9.8400, flhf_latitude: 10.3050, flhf_longitude: 9.8350,
    settlement_latitude: null, settlement_longitude: null,
    campaign_type: "ntd", population_source: "Household Listing", year_of_microplanning: 2026, notes: null,
  }),

  // === YOBE STATE ===
  d("demo-019", {
    state: "Yobe", lga: "Damaturu", ward: "Damaturu Central",
    flhf_name: "Damaturu Specialist Hospital", flhf_incharge_name: "Dr. Mohammed Ali", flhf_incharge_phone: "08088811122",
    community_name: "Nayinawa Community", community_leader_name: "Bulama Nayinawa", community_leader_phone: "08099922233",
    settlement_name: "Nayinawa IDP", settlement_mai_unguwa: "Camp Coordinator",
    community_distance_to_flhf_km: 2.0, settlement_distance_to_flhf_km: 2.5,
    terrain_type: "desert", accessibility: "accessible", security_clearance: "partial",
    estimated_total_population: 4600, estimated_children_0_4: 920, estimated_children_5_14: 1150, estimated_adults_15_plus: 2530,
    number_of_households: 766, trachoma_0_5_months: 170, trachoma_6m_6y: 750, trachoma_7_14y: 1150, trachoma_15_plus: 2530,
    cdd_names: "Falmata Bukar, Ali Modu", cdd_phone_numbers: "08011133344, 08022244455", cdd_from_community: true,
    community_latitude: 11.7500, community_longitude: 11.9600, flhf_latitude: 11.7450, flhf_longitude: 11.9550,
    settlement_latitude: 11.7530, settlement_longitude: 11.9630,
    campaign_type: "ntd", population_source: "IDP Registration", year_of_microplanning: 2026, notes: "Mixed host and IDP population",
  }),

  // === JIGAWA STATE ===
  d("demo-020", {
    state: "Jigawa", lga: "Dutse", ward: "Dutse Central",
    flhf_name: "Dutse General Hospital", flhf_incharge_name: "Dr. Salisu Ibrahim", flhf_incharge_phone: "08033355566",
    community_name: "Takur Community", community_leader_name: "Sarkin Takur", community_leader_phone: "08044466677",
    settlement_name: "Takur Farmer Settlement", settlement_mai_unguwa: "Mai Unguwa Adamu",
    community_distance_to_flhf_km: 4.5, settlement_distance_to_flhf_km: 6.0,
    terrain_type: "flat", accessibility: "accessible", security_clearance: "cleared",
    estimated_total_population: 2900, estimated_children_0_4: 580, estimated_children_5_14: 725, estimated_adults_15_plus: 1595,
    number_of_households: 483, trachoma_0_5_months: 108, trachoma_6m_6y: 472, trachoma_7_14y: 725, trachoma_15_plus: 1595,
    cdd_names: "Zahra'u Suleiman, Abdulkadir Musa", cdd_phone_numbers: "08055577788, 08066688899", cdd_from_community: true,
    community_latitude: 11.7000, community_longitude: 9.3400, flhf_latitude: 11.6950, flhf_longitude: 9.3350,
    settlement_latitude: 11.7050, settlement_longitude: 9.3450,
    campaign_type: "ntd", population_source: "Census Projection", year_of_microplanning: 2026, notes: null,
  }),
];
