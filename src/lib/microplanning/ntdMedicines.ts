/**
 * WHO-approved preventive chemotherapy (PC) and case-management medicines for
 * Neglected Tropical Diseases, including the standard co-administered
 * combinations used by the Nigeria NTD Programme.
 */

export interface NtdMedicine {
  name: string;
  program: string;
  /** Default dispensing unit for allocation */
  unit: string;
}

export const NTD_UNITS = ["Tablets", "Doses", "Bottles", "Vials", "mL", "Sachets", "Ampoules", "Blisters"] as const;

export const NTD_MEDICINES: NtdMedicine[] = [
  // Onchocerciasis / LF
  { name: "Ivermectin (Mectizan)", program: "Onchocerciasis", unit: "Tablets" },
  { name: "Albendazole", program: "Lymphatic Filariasis / STH", unit: "Tablets" },
  { name: "Mebendazole", program: "Soil-Transmitted Helminths", unit: "Tablets" },
  { name: "Diethylcarbamazine (DEC)", program: "Lymphatic Filariasis", unit: "Tablets" },
  { name: "Praziquantel", program: "Schistosomiasis", unit: "Tablets" },
  { name: "Azithromycin", program: "Trachoma (SAFE)", unit: "Tablets" },
  { name: "Azithromycin oral suspension", program: "Trachoma (SAFE)", unit: "Bottles" },
  { name: "Tetracycline 1% eye ointment", program: "Trachoma (SAFE)", unit: "Tubes" },
  { name: "Moxidectin", program: "Onchocerciasis", unit: "Tablets" },
  // Combinations (co-administration)
  { name: "Ivermectin + Albendazole (IA)", program: "LF / Onchocerciasis co-administration", unit: "Doses" },
  { name: "Diethylcarbamazine + Albendazole (DA)", program: "Lymphatic Filariasis", unit: "Doses" },
  { name: "Ivermectin + Diethylcarbamazine + Albendazole (IDA)", program: "Lymphatic Filariasis (triple therapy)", unit: "Doses" },
  { name: "Albendazole + Praziquantel", program: "STH + Schistosomiasis co-administration", unit: "Doses" },
  { name: "Ivermectin + Albendazole + Praziquantel", program: "Integrated NTD co-administration", unit: "Doses" },
  { name: "Azithromycin + Ivermectin + Albendazole", program: "Integrated NTD co-administration", unit: "Doses" },
  // Case management / other WHO-recommended NTD medicines
  { name: "Triclabendazole", program: "Fascioliasis / Paragonimiasis", unit: "Tablets" },
  { name: "Rifampicin", program: "Leprosy (MDT) / Buruli ulcer", unit: "Capsules" },
  { name: "Clofazimine", program: "Leprosy (MDT)", unit: "Capsules" },
  { name: "Dapsone", program: "Leprosy (MDT)", unit: "Tablets" },
  { name: "Multidrug therapy (MDT) blister pack", program: "Leprosy", unit: "Blisters" },
  { name: "Clarithromycin", program: "Buruli ulcer", unit: "Tablets" },
  { name: "Fexinidazole", program: "Human African Trypanosomiasis", unit: "Tablets" },
  { name: "Nifurtimox–Eflornithine (NECT)", program: "Human African Trypanosomiasis", unit: "Doses" },
  { name: "Benznidazole", program: "Chagas disease", unit: "Tablets" },
  { name: "Miltefosine", program: "Leishmaniasis", unit: "Capsules" },
  { name: "Liposomal amphotericin B", program: "Visceral Leishmaniasis", unit: "Vials" },
  { name: "Paromomycin", program: "Visceral Leishmaniasis", unit: "Vials" },
  { name: "Sodium stibogluconate", program: "Leishmaniasis", unit: "Vials" },
  { name: "Rabies immunoglobulin", program: "Rabies", unit: "Vials" },
  { name: "Anti-rabies vaccine", program: "Rabies", unit: "Doses" },
  { name: "Snake antivenom (polyvalent)", program: "Snakebite envenoming", unit: "Vials" },
];

export const findNtdMedicine = (name: string) => NTD_MEDICINES.find((m) => m.name === name);
