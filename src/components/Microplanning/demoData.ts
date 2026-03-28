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

// Helper to generate population breakdowns
const pop = (total: number) => ({
  estimated_total_population: total,
  estimated_children_0_4: Math.round(total * 0.2),
  estimated_children_5_14: Math.round(total * 0.25),
  estimated_adults_15_plus: Math.round(total * 0.55),
  number_of_households: Math.round(total / 6),
});

const trach = (total: number) => ({
  trachoma_0_5_months: Math.round(total * 0.037),
  trachoma_6m_6y: Math.round(total * 0.163),
  trachoma_7_14y: Math.round(total * 0.25),
  trachoma_15_plus: Math.round(total * 0.55),
});

// Nigerian state capitals and representative coordinates
const STATES_DATA: Array<{
  state: string; lga: string; ward: string; flhf: string;
  clat: number; clng: number; flat: number; flng: number;
  terrain: string; access: string; security: string; totalPop: number;
  dist: number; community: string; leader: string; campaign: string;
  popSource: string; notes: string | null; cddLocal: boolean;
}> = [
  // North-West
  { state: "Kano", lga: "Nassarawa", ward: "Gwale", flhf: "Nassarawa PHC", clat: 12.0022, clng: 8.5167, flat: 11.998, flng: 8.52, terrain: "flat", access: "accessible", security: "cleared", totalPop: 4800, dist: 1.2, community: "Unguwar Diko", leader: "Alhaji Musa Diko", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Kano", lga: "Ungogo", ward: "Rangaza", flhf: "Ungogo General Hospital", clat: 12.08, clng: 8.49, flat: 12.055, flng: 8.475, terrain: "flat", access: "hard_to_reach", security: "cleared", totalPop: 2100, dist: 5.3, community: "Rangaza Community", leader: "Malam Isa", campaign: "ntd", popSource: "Estimated", notes: "River crossing needed during rainy season", cddLocal: false },
  { state: "Kaduna", lga: "Zaria", ward: "Tudun Wada", flhf: "Tudun Wada PHC", clat: 11.085, clng: 7.71, flat: 11.082, flng: 7.708, terrain: "flat", access: "accessible", security: "cleared", totalPop: 5600, dist: 0.8, community: "Tudun Wada Central", leader: "Magajin Gari Aliyu", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Kaduna", lga: "Igabi", ward: "Turunku", flhf: "Turunku Health Post", clat: 10.85, clng: 7.58, flat: 10.835, flng: 7.565, terrain: "hilly", access: "hard_to_reach", security: "partial", totalPop: 1800, dist: 8.5, community: "Turunku Village", leader: "Village Head Tanko", campaign: "trachoma", popSource: "Household Listing", notes: "Nomadic settlement", cddLocal: true },
  { state: "Sokoto", lga: "Sokoto South", ward: "Gagi", flhf: "Gagi Health Centre", clat: 13.05, clng: 5.23, flat: 13.048, flng: 5.228, terrain: "riverine", access: "seasonal", security: "cleared", totalPop: 3800, dist: 2.0, community: "Gagi Community", leader: "Sarkin Gagi Abubakar", campaign: "trachoma", popSource: "Census Projection", notes: "Flooding July-Sept", cddLocal: true },
  { state: "Kebbi", lga: "Birnin Kebbi", ward: "Ambursa", flhf: "Ambursa PHC", clat: 12.45, clng: 4.19, flat: 12.448, flng: 4.188, terrain: "flat", access: "accessible", security: "cleared", totalPop: 6500, dist: 0.3, community: "Ambursa Town", leader: "District Head Abubakar", campaign: "ntd", popSource: "Household Listing", notes: null, cddLocal: true },
  { state: "Zamfara", lga: "Gusau", ward: "Tudun Wada", flhf: "Tudun Wada Clinic", clat: 12.17, clng: 6.66, flat: 12.168, flng: 6.658, terrain: "flat", access: "accessible", security: "partial", totalPop: 4200, dist: 1.0, community: "Tudun Wada Gusau", leader: "Hakimin Tudun Wada", campaign: "ntd", popSource: "Census Projection", notes: "Security escort needed", cddLocal: true },
  { state: "Katsina", lga: "Katsina", ward: "Shagari", flhf: "Shagari PHC", clat: 13.01, clng: 7.60, flat: 13.008, flng: 7.598, terrain: "flat", access: "accessible", security: "partial", totalPop: 3900, dist: 1.5, community: "Shagari Community", leader: "Sarkin Shagari", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },

  // North-East
  { state: "Borno", lga: "Maiduguri", ward: "Bolori I", flhf: "Bolori PHC", clat: 11.84, clng: 13.15, flat: 11.838, flng: 13.148, terrain: "flat", access: "accessible", security: "cleared", totalPop: 8200, dist: 0.5, community: "Bolori Layout", leader: "Bulama Aji Kolo", campaign: "ntd", popSource: "IDP Registration", notes: "High density IDP settlement", cddLocal: true },
  { state: "Borno", lga: "Jere", ward: "Dusuman", flhf: "Dusuman Dispensary", clat: 11.72, clng: 13.28, flat: 11.76, flng: 13.24, terrain: "desert", access: "inaccessible", security: "not_cleared", totalPop: 950, dist: 15.0, community: "Dusuman Village", leader: "Lawan Bukar Goni", campaign: "ntd", popSource: "Estimated", notes: "Armed group activity reported", cddLocal: false },
  { state: "Adamawa", lga: "Yola North", ward: "Jimeta", flhf: "Jimeta PHC", clat: 9.28, clng: 12.46, flat: 9.278, flng: 12.458, terrain: "flat", access: "accessible", security: "cleared", totalPop: 5100, dist: 1.0, community: "Jimeta Community", leader: "Jauro Jimeta", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Gombe", lga: "Gombe", ward: "Herwagana", flhf: "Herwagana Health Centre", clat: 10.28, clng: 11.17, flat: 10.27, flng: 11.16, terrain: "hilly", access: "hard_to_reach", security: "cleared", totalPop: 1950, dist: 7.0, community: "Herwagana Village", leader: "Sarkin Herwagana", campaign: "trachoma", popSource: "Estimated", notes: "Poor road infrastructure", cddLocal: true },
  { state: "Bauchi", lga: "Bauchi", ward: "Hardo", flhf: "Hardo PHC", clat: 10.31, clng: 9.84, flat: 10.305, flng: 9.835, terrain: "flat", access: "accessible", security: "cleared", totalPop: 3400, dist: 3.5, community: "Hardo Community", leader: "Hakimi Hardo", campaign: "ntd", popSource: "Household Listing", notes: null, cddLocal: true },
  { state: "Yobe", lga: "Damaturu", ward: "Damaturu Central", flhf: "Damaturu Specialist Hospital", clat: 11.75, clng: 11.96, flat: 11.745, flng: 11.955, terrain: "desert", access: "accessible", security: "partial", totalPop: 4600, dist: 2.0, community: "Nayinawa Community", leader: "Bulama Nayinawa", campaign: "ntd", popSource: "IDP Registration", notes: "Mixed host and IDP population", cddLocal: true },
  { state: "Taraba", lga: "Jalingo", ward: "Barade", flhf: "Barade PHC", clat: 8.89, clng: 11.36, flat: 8.885, flng: 11.355, terrain: "riverine", access: "seasonal", security: "cleared", totalPop: 2400, dist: 4.0, community: "Barade Community", leader: "Arnado Barade", campaign: "ntd", popSource: "Estimated", notes: "Benue River crossing", cddLocal: true },

  // North-Central
  { state: "Niger", lga: "Kontagora", ward: "Kontagora Central", flhf: "Kontagora General Hospital", clat: 10.40, clng: 5.47, flat: 10.395, flng: 5.46, terrain: "hilly", access: "hard_to_reach", security: "partial", totalPop: 2800, dist: 6.0, community: "Magama Community", leader: "Chief Ndaman Magama", campaign: "trachoma", popSource: "Estimated", notes: "Hilly terrain requires motorbike", cddLocal: false },
  { state: "Nasarawa", lga: "Lafia", ward: "Chiroma", flhf: "Chiroma PHC", clat: 8.49, clng: 8.52, flat: 8.485, flng: 8.515, terrain: "flat", access: "accessible", security: "cleared", totalPop: 3100, dist: 3.2, community: "Chiroma Village", leader: "Chief Samuel Adamu", campaign: "ntd", popSource: "Household Listing", notes: null, cddLocal: true },
  { state: "Plateau", lga: "Jos South", ward: "Bukuru", flhf: "Bukuru Health Centre", clat: 9.79, clng: 8.86, flat: 9.788, flng: 8.858, terrain: "mountainous", access: "accessible", security: "cleared", totalPop: 7200, dist: 1.5, community: "Bukuru Town", leader: "Da Gwom Bukuru", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Kwara", lga: "Ilorin West", ward: "Adewole", flhf: "Adewole PHC", clat: 8.50, clng: 4.55, flat: 8.498, flng: 4.548, terrain: "flat", access: "accessible", security: "cleared", totalPop: 4500, dist: 0.8, community: "Adewole Community", leader: "Mogaji Adewole", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Kogi", lga: "Lokoja", ward: "Lokoja Central", flhf: "Lokoja General Hospital", clat: 7.80, clng: 6.74, flat: 7.798, flng: 6.738, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 5800, dist: 1.2, community: "Lokoja Central", leader: "Ohimege of Lokoja", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Benue", lga: "Makurdi", ward: "North Bank", flhf: "North Bank PHC", clat: 7.75, clng: 8.54, flat: 7.748, flng: 8.538, terrain: "riverine", access: "seasonal", security: "cleared", totalPop: 3600, dist: 2.5, community: "North Bank Community", leader: "Chief Tyoor Agera", campaign: "ntd", popSource: "Household Listing", notes: "Benue River flooding risk", cddLocal: true },
  { state: "FCT", lga: "AMAC", ward: "Garki", flhf: "Garki General Hospital", clat: 9.05, clng: 7.49, flat: 9.048, flng: 7.488, terrain: "flat", access: "accessible", security: "cleared", totalPop: 9200, dist: 0.5, community: "Garki District", leader: "Village Head Garki", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },

  // South-West
  { state: "Lagos", lga: "Lagos Island", ward: "Isale Eko", flhf: "Isale Eko Health Centre", clat: 6.455, clng: 3.39, flat: 6.453, flng: 3.388, terrain: "flat", access: "accessible", security: "cleared", totalPop: 12500, dist: 0.3, community: "Isale Eko", leader: "Oba Rilwan Akiolu", campaign: "ntd", popSource: "Census Projection", notes: "High density urban area", cddLocal: true },
  { state: "Oyo", lga: "Ibadan North", ward: "Agodi Gate", flhf: "Agodi PHC", clat: 7.40, clng: 3.92, flat: 7.398, flng: 3.918, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 6800, dist: 0.7, community: "Agodi Community", leader: "Baale Agodi", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Osun", lga: "Osogbo", ward: "Oke Baale", flhf: "Oke Baale Health Centre", clat: 7.77, clng: 4.56, flat: 7.768, flng: 4.558, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 4100, dist: 1.0, community: "Oke Baale Community", leader: "Baale Oke Baale", campaign: "ntd", popSource: "Household Listing", notes: null, cddLocal: true },
  { state: "Ondo", lga: "Akure South", ward: "Isinkan", flhf: "Isinkan PHC", clat: 7.25, clng: 5.20, flat: 7.248, flng: 5.198, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 3500, dist: 1.5, community: "Isinkan Community", leader: "Baale Isinkan", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Ekiti", lga: "Ado Ekiti", ward: "Oke Ila", flhf: "Oke Ila Health Post", clat: 7.62, clng: 5.22, flat: 7.618, flng: 5.218, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 2900, dist: 1.2, community: "Oke Ila Community", leader: "Baale Oke Ila", campaign: "ntd", popSource: "Estimated", notes: null, cddLocal: true },
  { state: "Ogun", lga: "Abeokuta South", ward: "Ake", flhf: "Ake Health Centre", clat: 7.16, clng: 3.35, flat: 7.158, flng: 3.348, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 5200, dist: 0.6, community: "Ake Community", leader: "Baale Ake", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },

  // South-East
  { state: "Enugu", lga: "Enugu North", ward: "Ogui Urban", flhf: "Ogui PHC", clat: 6.46, clng: 7.51, flat: 6.458, flng: 7.508, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 5400, dist: 0.8, community: "Ogui Community", leader: "Igwe Ogui", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Anambra", lga: "Awka South", ward: "Amawbia", flhf: "Amawbia Health Centre", clat: 6.21, clng: 7.07, flat: 6.208, flng: 7.068, terrain: "flat", access: "accessible", security: "cleared", totalPop: 4300, dist: 1.0, community: "Amawbia Community", leader: "Igwe Amawbia", campaign: "ntd", popSource: "Household Listing", notes: null, cddLocal: true },
  { state: "Imo", lga: "Owerri Municipal", ward: "Owerri Urban", flhf: "Owerri Health Centre", clat: 5.485, clng: 7.035, flat: 5.483, flng: 7.033, terrain: "flat", access: "accessible", security: "cleared", totalPop: 6100, dist: 0.5, community: "Owerri Urban", leader: "Traditional Ruler Owerri", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Abia", lga: "Umuahia North", ward: "Ibeku", flhf: "Ibeku PHC", clat: 5.53, clng: 7.49, flat: 5.528, flng: 7.488, terrain: "flat", access: "accessible", security: "cleared", totalPop: 3800, dist: 1.2, community: "Ibeku Community", leader: "Eze Ibeku", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Ebonyi", lga: "Abakaliki", ward: "Azuiyiokwu", flhf: "Azuiyiokwu Health Centre", clat: 6.33, clng: 8.11, flat: 6.328, flng: 8.108, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 2700, dist: 2.0, community: "Azuiyiokwu Community", leader: "Igwe Azuiyiokwu", campaign: "ntd", popSource: "Estimated", notes: null, cddLocal: true },

  // South-South
  { state: "Cross River", lga: "Calabar South", ward: "Anantigha", flhf: "Anantigha Health Post", clat: 4.95, clng: 8.32, flat: 4.949, flng: 8.319, terrain: "swampy", access: "accessible", security: "cleared", totalPop: 1600, dist: 0.5, community: "Anantigha Village", leader: "Chief Effiong Bassey", campaign: "ntd", popSource: "Household Listing", notes: null, cddLocal: true },
  { state: "Rivers", lga: "Port Harcourt", ward: "Diobu", flhf: "Diobu Health Centre", clat: 4.78, clng: 7.01, flat: 4.778, flng: 7.008, terrain: "swampy", access: "accessible", security: "cleared", totalPop: 8900, dist: 0.4, community: "Diobu Community", leader: "Chief Diobu", campaign: "ntd", popSource: "Census Projection", notes: "Dense urban area", cddLocal: true },
  { state: "Akwa Ibom", lga: "Uyo", ward: "Ikot Ekpene", flhf: "Ikot Ekpene PHC", clat: 5.04, clng: 7.93, flat: 5.038, flng: 7.928, terrain: "flat", access: "accessible", security: "cleared", totalPop: 4700, dist: 1.0, community: "Ikot Ekpene Community", leader: "Village Head Ikot Ekpene", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Delta", lga: "Warri South", ward: "Warri Central", flhf: "Warri Central Hospital", clat: 5.52, clng: 5.76, flat: 5.518, flng: 5.758, terrain: "swampy", access: "seasonal", security: "cleared", totalPop: 5500, dist: 1.8, community: "Warri Central", leader: "Chief of Warri", campaign: "ntd", popSource: "Census Projection", notes: "Waterlogged terrain in wet season", cddLocal: true },
  { state: "Edo", lga: "Oredo", ward: "Ogbe", flhf: "Ogbe Health Centre", clat: 6.34, clng: 5.63, flat: 6.338, flng: 5.628, terrain: "flat", access: "accessible", security: "cleared", totalPop: 4900, dist: 0.6, community: "Ogbe Community", leader: "Chief Ogbe", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
  { state: "Bayelsa", lga: "Yenagoa", ward: "Yenagoa Central", flhf: "Yenagoa PHC", clat: 4.93, clng: 6.27, flat: 4.928, flng: 6.268, terrain: "swampy", access: "hard_to_reach", security: "cleared", totalPop: 2200, dist: 5.0, community: "Yenagoa Community", leader: "Chief of Yenagoa", campaign: "ntd", popSource: "Estimated", notes: "Riverine access only by boat", cddLocal: false },

  // Jigawa
  { state: "Jigawa", lga: "Dutse", ward: "Dutse Central", flhf: "Dutse General Hospital", clat: 11.70, clng: 9.34, flat: 11.695, flng: 9.335, terrain: "flat", access: "accessible", security: "cleared", totalPop: 2900, dist: 4.5, community: "Takur Community", leader: "Sarkin Takur", campaign: "ntd", popSource: "Census Projection", notes: null, cddLocal: true },
];

// Generate additional entries per state to create richer data (2nd community per state for larger states)
const EXTRA_COMMUNITIES: Array<{
  state: string; lga: string; ward: string; flhf: string;
  clat: number; clng: number; terrain: string; access: string; security: string;
  totalPop: number; dist: number; community: string; cddLocal: boolean;
}> = [
  { state: "Kano", lga: "Fagge", ward: "Fagge D2", flhf: "Fagge PHC", clat: 11.97, clng: 8.53, terrain: "flat", access: "accessible", security: "cleared", totalPop: 6200, dist: 0.8, community: "Fagge Central", cddLocal: true },
  { state: "Lagos", lga: "Surulere", ward: "Iponri", flhf: "Randle Hospital", clat: 6.50, clng: 3.36, terrain: "flat", access: "accessible", security: "cleared", totalPop: 15000, dist: 0.5, community: "Iponri Community", cddLocal: true },
  { state: "Kaduna", lga: "Kaduna South", ward: "Kakuri", flhf: "Kakuri PHC", clat: 10.48, clng: 7.44, terrain: "flat", access: "accessible", security: "partial", totalPop: 4800, dist: 1.5, community: "Kakuri Community", cddLocal: true },
  { state: "Rivers", lga: "Obio-Akpor", ward: "Rumuolumeni", flhf: "Rumuolumeni Health Centre", clat: 4.82, clng: 6.98, terrain: "swampy", access: "accessible", security: "cleared", totalPop: 7200, dist: 2.0, community: "Rumuolumeni", cddLocal: true },
  { state: "Borno", lga: "Konduga", ward: "Dalori", flhf: "Dalori Camp Clinic", clat: 11.78, clng: 13.20, terrain: "desert", access: "hard_to_reach", security: "not_cleared", totalPop: 12000, dist: 10.0, community: "Dalori IDP Camp", cddLocal: false },
  { state: "FCT", lga: "Bwari", ward: "Bwari Central", flhf: "Bwari PHC", clat: 9.28, clng: 7.38, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 3800, dist: 3.0, community: "Bwari Town", cddLocal: true },
  { state: "Oyo", lga: "Ibadan South-West", ward: "Challenge", flhf: "Challenge Health Centre", clat: 7.36, clng: 3.87, terrain: "flat", access: "accessible", security: "cleared", totalPop: 5500, dist: 1.2, community: "Challenge Community", cddLocal: true },
  { state: "Plateau", lga: "Jos North", ward: "Naraguta A", flhf: "Naraguta PHC", clat: 9.92, clng: 8.88, terrain: "mountainous", access: "hard_to_reach", security: "partial", totalPop: 2400, dist: 6.0, community: "Naraguta Village", cddLocal: false },
  { state: "Enugu", lga: "Nsukka", ward: "Nsukka Urban", flhf: "Nsukka Health Centre", clat: 6.86, clng: 7.40, terrain: "hilly", access: "accessible", security: "cleared", totalPop: 3200, dist: 1.5, community: "Nsukka Community", cddLocal: true },
  { state: "Sokoto", lga: "Sokoto North", ward: "Arkilla", flhf: "Arkilla Dispensary", clat: 13.08, clng: 5.25, terrain: "flat", access: "accessible", security: "cleared", totalPop: 5100, dist: 1.0, community: "Arkilla Community", cddLocal: true },
  { state: "Bauchi", lga: "Toro", ward: "Toro Central", flhf: "Toro PHC", clat: 10.07, clng: 9.07, terrain: "hilly", access: "hard_to_reach", security: "cleared", totalPop: 1700, dist: 12.0, community: "Toro Hill Village", cddLocal: false },
  { state: "Zamfara", lga: "Tsafe", ward: "Tsafe Central", flhf: "Tsafe Health Post", clat: 12.15, clng: 6.92, terrain: "flat", access: "accessible", security: "not_cleared", totalPop: 2300, dist: 3.0, community: "Tsafe Community", cddLocal: false },
  { state: "Katsina", lga: "Funtua", ward: "Funtua Central", flhf: "Funtua General Hospital", clat: 11.53, clng: 7.31, terrain: "flat", access: "accessible", security: "partial", totalPop: 4200, dist: 0.5, community: "Funtua Town", cddLocal: true },
  { state: "Anambra", lga: "Onitsha North", ward: "Onitsha Central", flhf: "Onitsha Health Centre", clat: 6.14, clng: 6.78, terrain: "flat", access: "accessible", security: "cleared", totalPop: 7800, dist: 0.6, community: "Onitsha Central", cddLocal: true },
  { state: "Adamawa", lga: "Mubi North", ward: "Mubi Central", flhf: "Mubi PHC", clat: 10.27, clng: 13.27, terrain: "hilly", access: "hard_to_reach", security: "partial", totalPop: 2100, dist: 8.0, community: "Mubi Hill Community", cddLocal: false },
];

let idCounter = 1;

function generateEntry(data: typeof STATES_DATA[0], idx: number): DemoMicroplanEntry {
  const id = `demo-${String(idCounter++).padStart(3, "0")}`;
  const p = pop(data.totalPop);
  const t = data.campaign === "trachoma" ? trach(data.totalPop) : { trachoma_0_5_months: null, trachoma_6m_6y: null, trachoma_7_14y: null, trachoma_15_plus: null };
  return d(id, {
    state: data.state, lga: data.lga, ward: data.ward,
    flhf_name: data.flhf,
    flhf_incharge_name: `Officer ${data.flhf.split(" ")[0]}`,
    flhf_incharge_phone: `0801${String(idx).padStart(7, "0")}`,
    community_name: data.community,
    community_leader_name: data.leader,
    community_leader_phone: `0802${String(idx).padStart(7, "0")}`,
    settlement_name: data.dist > 3 ? `${data.community} Extension` : null,
    settlement_mai_unguwa: data.dist > 3 ? "Mai Angwan Settlement" : null,
    community_distance_to_flhf_km: data.dist,
    settlement_distance_to_flhf_km: data.dist > 3 ? data.dist + 2 : null,
    terrain_type: data.terrain,
    accessibility: data.access,
    security_clearance: data.security,
    ...p,
    ...t,
    cdd_names: data.cddLocal ? `CDD ${data.community.split(" ")[0]} A, CDD ${data.community.split(" ")[0]} B` : "—",
    cdd_phone_numbers: data.cddLocal ? `0803${String(idx).padStart(7, "0")}, 0804${String(idx).padStart(7, "0")}` : "—",
    cdd_from_community: data.cddLocal,
    community_latitude: data.clat,
    community_longitude: data.clng,
    flhf_latitude: data.flat,
    flhf_longitude: data.flng,
    settlement_latitude: data.dist > 3 ? data.clat + 0.005 : null,
    settlement_longitude: data.dist > 3 ? data.clng + 0.005 : null,
    campaign_type: data.campaign,
    population_source: data.popSource,
    year_of_microplanning: 2026,
    notes: data.notes,
  });
}

function generateExtraEntry(data: typeof EXTRA_COMMUNITIES[0], idx: number): DemoMicroplanEntry {
  const id = `demo-${String(idCounter++).padStart(3, "0")}`;
  const p = pop(data.totalPop);
  return d(id, {
    state: data.state, lga: data.lga, ward: data.ward,
    flhf_name: data.flhf,
    flhf_incharge_name: `Officer ${data.flhf.split(" ")[0]}`,
    flhf_incharge_phone: `0805${String(idx).padStart(7, "0")}`,
    community_name: data.community,
    community_leader_name: `Leader ${data.community.split(" ")[0]}`,
    community_leader_phone: `0806${String(idx).padStart(7, "0")}`,
    settlement_name: data.dist > 3 ? `${data.community} Extension` : null,
    settlement_mai_unguwa: data.dist > 3 ? "Mai Angwan Extension" : null,
    community_distance_to_flhf_km: data.dist,
    settlement_distance_to_flhf_km: data.dist > 3 ? data.dist + 1.5 : null,
    terrain_type: data.terrain,
    accessibility: data.access,
    security_clearance: data.security,
    ...p,
    trachoma_0_5_months: null, trachoma_6m_6y: null, trachoma_7_14y: null, trachoma_15_plus: null,
    cdd_names: data.cddLocal ? `CDD ${data.community.split(" ")[0]} 1` : "—",
    cdd_phone_numbers: data.cddLocal ? `0807${String(idx).padStart(7, "0")}` : "—",
    cdd_from_community: data.cddLocal,
    community_latitude: data.clat,
    community_longitude: data.clng,
    flhf_latitude: data.clat - 0.002,
    flhf_longitude: data.clng - 0.002,
    settlement_latitude: data.dist > 3 ? data.clat + 0.005 : null,
    settlement_longitude: data.dist > 3 ? data.clng + 0.005 : null,
    campaign_type: "ntd",
    population_source: "Census Projection",
    year_of_microplanning: 2026,
    notes: null,
  });
}

export const DEMO_ENTRIES: DemoMicroplanEntry[] = [
  ...STATES_DATA.map((s, i) => generateEntry(s, i + 1)),
  ...EXTRA_COMMUNITIES.map((s, i) => generateExtraEntry(s, i + 100)),
];
