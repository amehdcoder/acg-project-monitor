// AUTO-GENERATED from LFAT XLSForm. Do not edit by hand.
import type { SAQuestion } from './definitions';

export const LFAT_ITEMS: SAQuestion[] = [
  {
    "id": "informant_1",
    "label": "Informant - Name",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Informant Information",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "informant_1_designation",
    "label": "Informant - Designation",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Informant Information",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "country",
    "label": "1.4 Country",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Nigeria",
        "label": "Nigeria"
      }
    ]
  },
  {
    "id": "state",
    "label": "1.5.a Admin area 1 (State)",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": null,
    "type": "select_one",
    "optionsFrom": "nigeria_states"
  },
  {
    "id": "lga",
    "label": "1.5.b Admin area 2 (LGA)",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": null,
    "type": "select_one",
    "optionsFrom": "nigeria_lgas",
    "dependsOn": "state"
  },
  {
    "id": "admin2_other",
    "label": "Other District",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": "#form/domain_1/background3/admin2 = 'Other'",
    "type": "text"
  },
  {
    "id": "admin3",
    "label": "1.5.c Admin area 3 (Health Facility)",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": "#form/domain_1/background3/admin2 != 'Other'",
    "type": "text"
  },
  {
    "id": "admin3_other",
    "label": "Other Health Facility",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": "#form/domain_1/background3/admin3 = 'Other' or #form/domain_1/background3/admin2 = 'Other'",
    "type": "text"
  },
  {
    "id": "GPS",
    "label": "Take GPS position automatically",
    "required": true,
    "hint": "GPS coordinates can only be collected outdoors!",
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "date",
    "label": "1.1 Date of data collection",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 2",
    "relevant": null,
    "type": "date"
  },
  {
    "id": "interviewer",
    "label": "1.2 Interviewer name",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 2",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "interviewer_old",
    "label": "1.2 Interviewer name",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 2",
    "relevant": "#form/domain_1/background2/date = 111",
    "type": "text"
  },
  {
    "id": "facilitytype",
    "label": "1.6 Type of facility",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 3",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "tertiary",
        "label": "Tertiary Health Care Facility"
      },
      {
        "value": "secondary",
        "label": "Secondary Health Care Facility"
      },
      {
        "value": "phc",
        "label": "Primary Health Care Facility"
      },
      {
        "value": "other",
        "label": "Other"
      }
    ]
  },
  {
    "id": "facilitytype_specify",
    "label": "1.6.1 Please specify type of facility",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 3",
    "relevant": "selected(#form/domain_1/background4/facilitytype, 'other')",
    "type": "text"
  },
  {
    "id": "authority",
    "label": "1.7 Managing authority",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 3",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "gov_public",
        "label": "Government/Public"
      },
      {
        "value": "ngo",
        "label": "NGO/Not-for-profit"
      },
      {
        "value": "private",
        "label": "Private-for-profit"
      },
      {
        "value": "mission",
        "label": "Mission/Faith-based"
      },
      {
        "value": "other",
        "label": "Other"
      }
    ]
  },
  {
    "id": "authority_specify",
    "label": "1.7.1 Please specify type of managing authority",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 3",
    "relevant": "selected(#form/domain_1/background4/authority, 'other')",
    "type": "text"
  },
  {
    "id": "comments_1",
    "label": "1.8 Additional comments or clarification (please include question number)",
    "required": false,
    "hint": null,
    "section": "Domain 1 - Background Information · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "staff_trained",
    "label": "2.1 Have any staff currently working at this facility ever been trained or retrained in lympheodema management?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Trained Staff",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "No",
        "label": "No"
      },
      {
        "value": "dontknow",
        "label": "Don't know"
      },
      {
        "value": "refused",
        "label": "Refused"
      }
    ]
  },
  {
    "id": "number_staff_trained",
    "label": "2.2 How many currently working staff at this facility have ever been trained or retrained in lymphoedema management?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Trained Staff",
    "relevant": "#form/domain_2/staff_trained = 'yes'",
    "type": "number"
  },
  {
    "id": "staff_trained_last_2_years",
    "label": "2.3 Have any staff who are currently working at this facility been trained or retrained in\nlymphoedema management in the last 2 years?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Trained Staff",
    "relevant": "#form/domain_2/staff_trained = 'yes'",
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "No",
        "label": "No"
      },
      {
        "value": "dontknow",
        "label": "Don't know"
      },
      {
        "value": "refused",
        "label": "Refused"
      }
    ]
  },
  {
    "id": "number_staff_trained_last_2_years",
    "label": "2.4 How many currently working staff at this facility have been trained or retrained in\nlymphoedema management in the last 2 years?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Trained Staff",
    "relevant": "#form/domain_2/staff_trained_last_2_years = 'yes'",
    "type": "number"
  },
  {
    "id": "staff_titles",
    "label": "2.5 What are the titles of staff members who have been trained or re-trained in lymphoedema management in the last 2 years?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Trained Staff",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "physicians",
        "label": "Physicians"
      },
      {
        "value": "nurses",
        "label": "Nurses"
      },
      {
        "value": "health_assistants_officers",
        "label": "Health assistants/officers"
      },
      {
        "value": "community_health_workers",
        "label": "Community health workers"
      },
      {
        "value": "community_volunteer",
        "label": "Community volunteer"
      },
      {
        "value": "other",
        "label": "Other"
      }
    ]
  },
  {
    "id": "other_titles_of_staff_members",
    "label": "2.6 Other titles of staff members who have been trained or re-trained in lymphoedema management in the last 2 years",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Trained Staff",
    "relevant": "selected(#form/domain_2/staff_titles, 'other')",
    "type": "text"
  },
  {
    "id": "alt2_note",
    "label": "The following answers from section 2 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": false,
    "hint": null,
    "section": "Domain 2 - Trained Staff · Note - Section 2",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_staff_trained",
    "label": "Staff who are currently working at this facility have not been trained or retrained in lympheodema management",
    "required": false,
    "hint": null,
    "section": "Domain 2 - Trained Staff · Note - Section 2",
    "relevant": "not(selected(#form/domain_2/staff_trained_last_2_years, 'yes'))",
    "type": "note"
  },
  {
    "id": "comments_2",
    "label": "2.7 Additional comments or clarification for section 2 (please include question number)",
    "required": false,
    "hint": null,
    "section": "Domain 2 - Trained Staff · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "mmdp_materials_present",
    "label": "3.1 Are there lymphoedema management guidelines targeted to health workers present at this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Case management and Educational Materials",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "No",
        "label": "No"
      },
      {
        "value": "dontknow",
        "label": "Don't know"
      },
      {
        "value": "refused",
        "label": "Refused"
      }
    ]
  },
  {
    "id": "guidelines_for_lymphedema_management_present",
    "label": "3.2 Please show me the guidelines for lymphedema management present at this facility",
    "required": true,
    "hint": "Mark all that are seen",
    "section": "Domain 3 - Case management and Educational Materials",
    "relevant": "#form/domain_3/mmdp_materials_present = 'yes'",
    "type": "select_one",
    "options": [
      {
        "value": "gpelf_guidelines",
        "label": "GPELF guidelines"
      },
      {
        "value": "WHO_guidelines",
        "label": "Regional WHO guidelines"
      },
      {
        "value": "National_guidelines",
        "label": "National guidelines"
      },
      {
        "value": "Training_material",
        "label": "Job aid or Training material"
      },
      {
        "value": "Lymphedema_management_video",
        "label": "Lymphedema management video"
      },
      {
        "value": "other",
        "label": "Other (please specify)"
      },
      {
        "value": "none_seen",
        "label": "No guidelines visualized"
      }
    ]
  },
  {
    "id": "other_guidelines",
    "label": "3.2.1 Other guidelines for lymphedema management present at this facility",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Case management and Educational Materials",
    "relevant": "#form/domain_3/guidelines_for_lymphedema_management_present = 'other'",
    "type": "text"
  },
  {
    "id": "materials_written_in_local_language",
    "label": "3.3 Please show me the patient education materials written in the local language (or are pictorial) that are available at this health facility?",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Case management and Educational Materials",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "public_awareness_poster",
        "label": "Public Awareness Poster"
      },
      {
        "value": "flip_chart",
        "label": "Flip chart"
      },
      {
        "value": "leaflets",
        "label": "Leaflets"
      },
      {
        "value": "booklets",
        "label": "Booklets"
      },
      {
        "value": "morbidity_manual",
        "label": "Morbidity manual"
      },
      {
        "value": "other",
        "label": "Other (please specify)"
      },
      {
        "value": "none_seen",
        "label": "None seen"
      }
    ]
  },
  {
    "id": "other_materials_written_in_local_language",
    "label": "3.3.1 Other patient education materials written in the local language (or are pictorial) that are available at this health facility",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Case management and Educational Materials",
    "relevant": "selected(#form/domain_3/materials_written_in_local_language, 'other')",
    "type": "text"
  },
  {
    "id": "alt2_note_2",
    "label": "The following answers from section 3 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": false,
    "hint": null,
    "section": "Domain 3 - Case management and Educational Materials · Note - Section 3",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_mmdp_guidelines",
    "label": "There are no lymphoedema management guidelines targeted to health workers present at this facility",
    "required": false,
    "hint": null,
    "section": "Domain 3 - Case management and Educational Materials · Note - Section 3",
    "relevant": "not(selected(#form/domain_3/mmdp_materials_present, 'yes'))",
    "type": "note"
  },
  {
    "id": "alt_materials_written_in_local_language",
    "label": "There are no patient education materials written in the local language (or are pictorial) that are available at this health facility",
    "required": false,
    "hint": null,
    "section": "Domain 3 - Case management and Educational Materials · Note - Section 3",
    "relevant": "selected(#form/domain_3/materials_written_in_local_language, 'none_seen')",
    "type": "note"
  },
  {
    "id": "comments_3",
    "label": "3.3 Additional comments or clarification for section 3 (please include question number)",
    "required": false,
    "hint": null,
    "section": "Domain 3 - Case management and Educational Materials · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "watersource",
    "label": "4.1. What is the main source of water for the facility at this time?",
    "required": true,
    "hint": "(This question refers to the source of water for general purposes, not just for drinking)_x000D_\n_x000D_\nScoring based on UN definition of improved water source_x000D_\n ",
    "section": "Domain 4 - Infrastructure",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "piped_supply_inside_the_building",
        "label": "Piped supply inside the building"
      },
      {
        "value": "piped_supply_outside_the_building",
        "label": "Piped supply outside the building"
      },
      {
        "value": "tube_well",
        "label": "Tube well or borehole"
      },
      {
        "value": "protected_well",
        "label": "Protected dug well"
      },
      {
        "value": "unprotected_well",
        "label": "Unprotected dug well"
      },
      {
        "value": "protected_spring",
        "label": "Protected spring"
      },
      {
        "value": "unprotected_spring",
        "label": "Unprotected spring"
      },
      {
        "value": "rainwater",
        "label": "Rainwater collection"
      },
      {
        "value": "tanker_truck",
        "label": "Tanker truck"
      },
      {
        "value": "surface_water",
        "label": "Surface water (river/dam/lake/pond)"
      },
      {
        "value": "other",
        "label": "Other"
      },
      {
        "value": "dontknow",
        "label": "Don't know"
      },
      {
        "value": "no",
        "label": "No water source"
      }
    ]
  },
  {
    "id": "watersource_specify",
    "label": "4.1.1 Please specify the water source",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure",
    "relevant": "selected(#form/domain_4/watersource, 'other')",
    "type": "text"
  },
  {
    "id": "watersource_location",
    "label": "4.2 Where is the main water supply for the facility located?",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "on_premises",
        "label": "On premises"
      },
      {
        "value": "up_to_500m",
        "label": "Up to 500 m"
      },
      {
        "value": "500m_plus",
        "label": "500 m or further"
      },
      {
        "value": "unable_to_assess_location_of_water_supply",
        "label": "Unable to assess location of water supply"
      }
    ]
  },
  {
    "id": "confirm_water_is_available",
    "label": "4.3 Is water available from the main water supply at the time of the survey?",
    "required": true,
    "hint": "e.g. check that taps or hand pumps deliver water",
    "section": "Domain 4 - Infrastructure",
    "relevant": "#form/domain_4/watersource != 'no'",
    "type": "select_one",
    "options": [
      {
        "value": "water_available",
        "label": "Yes, water from this source is available"
      },
      {
        "value": "water_not_available",
        "label": "No, water from this source is not available"
      },
      {
        "value": "unable_to_assess",
        "label": "Unable to assess"
      }
    ]
  },
  {
    "id": "alt2_note_3",
    "label": "The following answers from section 4 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": false,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Note - Section 4",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_watersource",
    "label": "The health facility does not have a suitable water source",
    "required": false,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Note - Section 4",
    "relevant": "selected(#form/domain_4/watersource, 'unprotected_well') or selected(#form/domain_4/watersource, 'surface_water') or selected(#form/domain_4/watersource, 'other') or selected(#form/domain_4/watersource, 'dontknow') or #form/domain_4/watersource = 'no' or #form/domain_4/watersource = 'unprotected_spring'",
    "type": "note"
  },
  {
    "id": "comments_4",
    "label": "4.4 Additional comments or clarification for section 4 (please include question number)",
    "required": false,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "medications_available_and_description",
    "label": "5.1 Please show me the following medications and describe their availability at this facility",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "Antiseptic",
    "label": "Antiseptic (e.g. potassium permanganate or other anti-bacterial)",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "antifungal",
    "label": "Antifungal (e.g. potassium permanganate or Whitfield’s ointment)",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "analgesic_or_anti_inflammatory",
    "label": "Analgesic or anti-inflammatory (e.g. Paracetomol)",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "inflammatory-in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "inflammatory-in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "inflammatory-stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "inflammatory-never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "oral_antibiotics",
    "label": "Oral antibiotics (e.g. amoxicillin, doxycycline)",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "injectable_antibiotics",
    "label": "Injectable antibiotics (e.g. benzathin, benzylpénicilline, ampicillin, ceftriaxone)",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "ivm_dec",
    "label": "Ivermectin (IVM)/Diethylcarbamazine citrate (DEC)",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "albendazole",
    "label": "Albendazole",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "other_medications_used_to_treat_fl",
    "label": "5.2 Are there any other medications that you use to treat LF and that are available at least sometimes at this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "other_medication_available",
    "label": "5.3 Please specify \"other\" medication available",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": "#form/domain_5/medication/other_medications_used_to_treat_fl = 'yes'",
    "type": "text"
  },
  {
    "id": "other_medication_availibility_description",
    "label": "5.4 Please describe the availability of this \"other\" medication",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Medications",
    "relevant": "#form/domain_5/medication/other_medications_used_to_treat_fl = 'yes'",
    "type": "text"
  },
  {
    "id": "articles_available_and_description",
    "label": "5.5 Please show me the following supplies and describe their availability at this facility",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "bucket_or_basin",
    "label": "Bucket or basin",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "soap",
    "label": "Soap",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "towels",
    "label": "Towels",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "Gauze_or_cotton_cloth",
    "label": "Gauze or cotton cloth",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "cold_compress",
    "label": "Cold compress",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "nail_clippers",
    "label": "Nail clippers",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "patient_hygiene_kits",
    "label": "Patient hygiene kits (if appropriate)",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_stock_sufficient",
        "label": "Currently in stock in sufficient quantities (a)"
      },
      {
        "value": "in_stock_not_sufficient",
        "label": "Currently in stock but NOT in sufficient quantities (b)"
      },
      {
        "value": "stocked-out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "other_supplies_used_to_treat_fl",
    "label": "5.6 Are there any other supplies that you use to treat/manage LF that are available at least sometimes at this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "other_supplies_available",
    "label": "5.7 Please specify \"other\" supplies available",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": "#form/domain_5/supply/other_supplies_used_to_treat_fl = 'yes'",
    "type": "text"
  },
  {
    "id": "other_supplies_availibility_description",
    "label": "5.8 Please describe the availability of these \"other\" supplies",
    "required": true,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Supply",
    "relevant": "#form/domain_5/supply/other_supplies_used_to_treat_fl = 'yes'",
    "type": "text"
  },
  {
    "id": "alt5_note",
    "label": "The following answers from section 5 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_antiseptic",
    "label": "Antiseptic is not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/medication/Antiseptic = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_antifungal",
    "label": "Antifungal is not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/medication/antifungal = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_analgesic",
    "label": "Analgesic or anti-inflammatory is not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/medication/analgesic_or_anti-inflammatory = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_Oral_antibiotics",
    "label": "Oral antibiotics are not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/medication/oral_antibiotics = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_Injectable_antibiotics",
    "label": "Injectable antibiotics are not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/medication/injectable_antibiotics = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_Diethylcarbamazine",
    "label": "Ivermectine/Diethylcarbamazine is not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/medication/ivm_dec = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_Albendazole",
    "label": "Albendazole is not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/medication/albendazole = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_Bucket",
    "label": "Bucket is not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/supply/bucket_or_basin = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_Soap",
    "label": "Soap is not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/supply/soap = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_Towels",
    "label": "Towels are not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/supply/towels = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_Gauze",
    "label": "Gauze or cotton cloth is not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/supply/Gauze_or_cotton_cloth = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_Cold_compress",
    "label": "Cold compress are not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/supply/cold_compress = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_nail_clippers",
    "label": "Nail clippers are not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/supply/nail_clippers = 'never_available'",
    "type": "note"
  },
  {
    "id": "alt_patient_hygiene_kit",
    "label": "Patient hygiene kits are not available at the health facility level",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Note - Section 5",
    "relevant": "#form/domain_5/supply/patient_hygiene_kits = 'never_available'",
    "type": "note"
  },
  {
    "id": "comments_5",
    "label": "5.9 Additional comments or clarification for section 5 (please include question number)",
    "required": false,
    "hint": null,
    "section": "Domain 5 - Medications and Commodities · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "existing_system_for_identifying_and_quatifying",
    "label": "6.1 Does this facility have a system for identifying and quantifying the number of patients with lymphoedema in this facility catchment?",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "No",
        "label": "No"
      },
      {
        "value": "dontknow",
        "label": "Don't know"
      },
      {
        "value": "refused",
        "label": "Refused"
      }
    ]
  },
  {
    "id": "system_used",
    "label": "6.2 What system is being used by this facility for identifying and quantifying the number of patients with lymphoedema?",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "patient_register",
        "label": "Patient Register"
      },
      {
        "value": "paper_patient_charts",
        "label": "Paper patient charts"
      },
      {
        "value": "hmis_dhis2",
        "label": "Health Management Information System (HMIS) / DHIS2"
      },
      {
        "value": "other",
        "label": "Other (please specify)"
      }
    ]
  },
  {
    "id": "other_system_used",
    "label": "6.2.1 Other system is being used by this facility for identifying and quantifying the number of patients with lymphoedema?",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System",
    "relevant": "selected(#form/domain_6/system_used, 'other')",
    "type": "text"
  },
  {
    "id": "patients_with_lymphoedema",
    "label": "6.3 How many patients with lymphedema have been reported in the last 12 months?",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System",
    "relevant": null,
    "type": "number"
  },
  {
    "id": "alt6_note",
    "label": "The following answers from section 6 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": false,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System · Note - Section 6",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_patient_tracking_system",
    "label": "This facility does NOT have a system for identifying and quantifying the number of patients with lymphoedema",
    "required": false,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System · Note - Section 6",
    "relevant": "not(selected(#form/domain_6/existing_system_for_identifying_and_quatifying, 'yes'))",
    "type": "note"
  },
  {
    "id": "comments_6",
    "label": "6.4 Additional comments or clarification for section 6 (please include question number)",
    "required": false,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "alt_intro_sec_7",
    "label": "READ to facility director/point of contact: I would like to ask any member of your facility who has been trained in lymphoedema management a few questions about lymphoedema and acute attacks.",
    "required": false,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Availability & Consent",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "staff_member_available",
    "label": "7.0 Is there a staff member who is responsible for lymphoedema management that is available?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Availability & Consent",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "alt_memb_sec_7",
    "label": "READ to member of facility: I would like to ask you a few questions about lymphoedema management and acute attacks. Your answers will be completely anonymous and will in no way impact your status of employment.",
    "required": false,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Availability & Consent",
    "relevant": "#form/domain_7/availability_consent_sec_7/staff_member_available = 'yes'",
    "type": "note"
  },
  {
    "id": "alt_consent",
    "label": "7.0.a Has the individual verbally acknowledged that they are willing to participate in the following survey?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Availability & Consent",
    "relevant": "#form/domain_7/availability_consent_sec_7/staff_member_available = 'yes'",
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "signs_and_symptoms_of_lymphedema",
    "label": "7.1 Please describe for me the signs and symptoms of lymphedema",
    "required": true,
    "hint": "Mark all that apply",
    "section": "Domain 7 - Staff Knowledge · Lymphoedema management and acute attacks",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Swelling_reversible_at_night",
        "label": "Swelling (reversible at night)"
      },
      {
        "value": "Swelling_irreversible",
        "label": "Swelling (irreversible)"
      },
      {
        "value": "Skin_folds",
        "label": "Skin folds (shallow or deep)"
      },
      {
        "value": "Knobs_on_the_skin",
        "label": "Knobs on the skin"
      },
      {
        "value": "Mossy_lesions",
        "label": "Mossy lesions (i.e. small elongated or rounded growths)"
      },
      {
        "value": "Inability_to_perform_daily_activitie",
        "label": "Inability to perform daily activities or care for self"
      },
      {
        "value": "Acute_attacks_adenolymphangitis",
        "label": "Acute attacks/adenolymphangitis (ADL)"
      },
      {
        "value": "Wounds_or_entry_lesions",
        "label": "Wounds or entry lesions"
      },
      {
        "value": "other",
        "label": "Other (please specify)"
      },
      {
        "value": "Dont_know_any_signs_symptoms",
        "label": "Don't know any signs/symptoms of lymphedema"
      }
    ]
  },
  {
    "id": "other_signs_and_symptoms_of_lymphedema",
    "label": "7.1.1 Other signs and symptoms of lymphedema",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Lymphoedema management and acute attacks",
    "relevant": "selected(#form/domain_7/lymphoedema_management_and_acute_attacks/signs_and_symptoms_of_lymphedema, 'other')",
    "type": "text"
  },
  {
    "id": "signs_and_symptoms_of_an_acute_attack",
    "label": "7.2 Please describe for me the signs and symptoms of an acute attack",
    "required": true,
    "hint": "Mark all that apply",
    "section": "Domain 7 - Staff Knowledge · Lymphoedema management and acute attacks",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Redness_of_limb",
        "label": "Redness of limb"
      },
      {
        "value": "Warmth_of_limb",
        "label": "Warmth of limb"
      },
      {
        "value": "Increased_swelling_of_limb",
        "label": "Increased swelling of limb"
      },
      {
        "value": "Painful_limb",
        "label": "Painful limb"
      },
      {
        "value": "Fever",
        "label": "Fever"
      },
      {
        "value": "Headache",
        "label": "Headache"
      },
      {
        "value": "Chills",
        "label": "Chills"
      },
      {
        "value": "Nausea_vomiting",
        "label": "Nausea/vomiting"
      },
      {
        "value": "other",
        "label": "Other (please specify)"
      },
      {
        "value": "Dont_know_any_signs_and_symptoms_of_an_acute_attack",
        "label": "Don’t know any signs and symptoms of an acute attack"
      }
    ]
  },
  {
    "id": "other_signs_and_symptoms_of_an_acute_attack",
    "label": "7.2.1 Other signs and symptoms of an acute attack",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Lymphoedema management and acute attacks",
    "relevant": "selected(#form/domain_7/lymphoedema_management_and_acute_attacks/signs_and_symptoms_of_an_acute_attack, 'other')",
    "type": "text"
  },
  {
    "id": "strategies_to_teach_for_lymph_acute_attacks",
    "label": "7.3 Please describe for me all of the strategies you would teach a lymphoedema patient for preventing the progression of lymphoedema and preventing acute attacks",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Lymphoedema management and acute attacks",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Hygiene_Washing_and_drying_the_affected_limb",
        "label": "Hygiene / Washing and drying the affected limb"
      },
      {
        "value": "Wound_care_entrance_lesion_care",
        "label": "Wound care/entrance lesion care"
      },
      {
        "value": "Elevation",
        "label": "Elevation"
      },
      {
        "value": "Rest",
        "label": "Rest"
      },
      {
        "value": "Exercises",
        "label": "Exercises"
      },
      {
        "value": "Shoe_use",
        "label": "Shoe use"
      },
      {
        "value": "Prophylactic_creams",
        "label": "Prophylactic creams"
      },
      {
        "value": "Prophylactic_systemic_antibiotics",
        "label": "Prophylactic systemic antibiotics"
      },
      {
        "value": "traditional_remedies",
        "label": "Traditional remedies"
      },
      {
        "value": "Other",
        "label": "Other (please specify)"
      },
      {
        "value": "Dont_know_any_lymphedema_management_techniques",
        "label": "Do not know any lymphedema management techniques"
      }
    ]
  },
  {
    "id": "other_strategies_to_teach_for_lymph_acute_attacks",
    "label": "7.3.1 Other strategies you might use to treat a patient experiencing an acute attack.",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Lymphoedema management and acute attacks",
    "relevant": "selected(#form/domain_7/lymphoedema_management_and_acute_attacks/strategies_to_teach_for_lymph_acute_attacks, 'Other')",
    "type": "text"
  },
  {
    "id": "strategies_to_treat_for_acute_attacks",
    "label": "7.4 Please describe for me all of the management strategies you could use to treat a patient who is having an acute attack (ADL)",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Lymphoedema management and acute attacks",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Cool_leg_in_bucket",
        "label": "Cool leg in bucket of cool water or using a cold compress"
      },
      {
        "value": "Analgesic_or_anti-inflammatory_medications",
        "label": "Analgesic or anti-inflammatory medications"
      },
      {
        "value": "Topical_antibiotics",
        "label": "Topical antibiotics"
      },
      {
        "value": "Oral_antibiotics",
        "label": "Oral antibiotics"
      },
      {
        "value": "Injectable_antibiotics",
        "label": "Injectable antibiotics"
      },
      {
        "value": "Rest",
        "label": "Rest"
      },
      {
        "value": "Elevation",
        "label": "Elevation"
      },
      {
        "value": "Provide_fluids",
        "label": "Provide fluids"
      },
      {
        "value": "Advise_patient_to_avoid_exercises",
        "label": "Advise patient to avoid exercises for duration of acute attack"
      },
      {
        "value": "Other",
        "label": "Other (please specify)"
      },
      {
        "value": "Dont_know_any_acute_attack_treatments",
        "label": "Don’t know any acute attack treatments"
      }
    ]
  },
  {
    "id": "other_strategies",
    "label": "7.4.1 Other strategies you might use to treat a patient experiencing an acute attack.",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Lymphoedema management and acute attacks",
    "relevant": "selected(#form/domain_7/lymphoedema_management_and_acute_attacks/strategies_to_treat_for_acute_attacks, 'Other')",
    "type": "text"
  },
  {
    "id": "alt7_note",
    "label": "The following answers from section 7 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": false,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Note - Section 7",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_sign_lymphoedema",
    "label": "Community Health Care Providers (CHCP) currently working at this facility have not been trained or retrained in lympheodema management",
    "required": false,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Note - Section 7",
    "relevant": "not(selected(#form/domain_7/lymphoedema_management_and_acute_attacks/signs_and_symptoms_of_lymphedema, 'other')) or not(selected(#form/domain_7/lymphoedema_management_and_acute_attacks/signs_and_symptoms_of_lymphedema, 'Dont_know_any_signs_symptoms'))",
    "type": "note"
  },
  {
    "id": "alt_sign_acute_attack",
    "label": "Community Health Care Providers (CHCP) currently working at this facility have not been trained or retrained in lympheodema management",
    "required": false,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Note - Section 7",
    "relevant": "not(selected(#form/domain_7/lymphoedema_management_and_acute_attacks/signs_and_symptoms_of_an_acute_attack, 'other')) or not(selected(#form/domain_7/lymphoedema_management_and_acute_attacks/signs_and_symptoms_of_an_acute_attack, 'Dont_know_any_signs_symptoms'))",
    "type": "note"
  },
  {
    "id": "alt_acute_attack_teaching",
    "label": "Community Health Care Providers (CHCP) currently working at this facility do not know of any strategies to teach to prevent the progression of lymphedema and the occurrence of acute attacks.",
    "required": false,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Note - Section 7",
    "relevant": "not(selected(#form/domain_7/lymphoedema_management_and_acute_attacks/strategies_to_teach_for_lymph_acute_attacks, 'other')) or not(selected(#form/domain_7/lymphoedema_management_and_acute_attacks/strategies_to_teach_for_lymph_acute_attacks, 'Dont_know_any_signs_symptoms'))",
    "type": "note"
  },
  {
    "id": "alt_acute_attack_treatment",
    "label": "Community Health Care Providers (CHCP) currently working at this facility have not been trained or retrained in lympheodema management",
    "required": false,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Note - Section 7",
    "relevant": "not(selected(#form/domain_7/lymphoedema_management_and_acute_attacks/strategies_to_treat_for_acute_attacks, 'other')) or not(selected(#form/domain_7/lymphoedema_management_and_acute_attacks/strategies_to_treat_for_acute_attacks, 'Dont_know_any_signs_symptoms'))",
    "type": "note"
  },
  {
    "id": "comments_7",
    "label": "7.5 Additional comments or clarification for section 7 (please include question number)",
    "required": false,
    "hint": null,
    "section": "Domain 7 - Staff Knowledge · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "challenges_in_providing_high_quality_lymphedema_care_yn",
    "label": "8.1 Does your facility face any challenges in providing high quality lymphedema care to patients with lymphedema at this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 8 - MMDP Challenges and feedback",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "No",
        "label": "No"
      },
      {
        "value": "dontknow",
        "label": "Don't know"
      },
      {
        "value": "refused",
        "label": "Refused"
      }
    ]
  },
  {
    "id": "challenges_selection",
    "label": "8.2 What are the challenges you face in providing high quality lymphedema care to patients with lymphedema at this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 8 - MMDP Challenges and feedback",
    "relevant": "#form/domain_8/challenges_in_providing_high_quality_lymphedema_care_yn = 'yes'",
    "type": "select_one",
    "options": [
      {
        "value": "Not_aware",
        "label": "Not aware I needed to provide this service"
      },
      {
        "value": "Lack_of_medication_supplies",
        "label": "Lack of medication/supplies"
      },
      {
        "value": "Lack_of_training",
        "label": "Lack of training"
      },
      {
        "value": "Lack_of_human_resources",
        "label": "Lack of human resources"
      },
      {
        "value": "Poor_supervision_or_support",
        "label": "Poor supervision or support"
      },
      {
        "value": "Poor_motivation",
        "label": "Poor motivation"
      },
      {
        "value": "Too_many_patients",
        "label": "Too many patients"
      },
      {
        "value": "Patients_don’t_present_to_facility",
        "label": "Patients don’t present to facility"
      },
      {
        "value": "Never_encountered_a_person_with_lymphedema",
        "label": "Never encountered a person with lymphedema"
      },
      {
        "value": "other",
        "label": "Other (please specify)"
      },
      {
        "value": "dont_know",
        "label": "Don’t know"
      }
    ]
  },
  {
    "id": "other_challenges",
    "label": "8.2.1 Other challenges you face in providing high quality lymphedema care to patients with lymphedema at this facility",
    "required": true,
    "hint": "Check all that apply",
    "section": "Domain 8 - MMDP Challenges and feedback",
    "relevant": "selected(#form/domain_8/challenges_selection, 'other')",
    "type": "text"
  },
  {
    "id": "way_of_improving_services",
    "label": "8.3 How can the services for lymphedema patients be improved at this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 8 - MMDP Challenges and feedback",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Improve_supervisory_support",
        "label": "Improve supervisory support and communication"
      },
      {
        "value": "Increase_human_resources",
        "label": "Increase human resources"
      },
      {
        "value": "Increase_staff_motivation",
        "label": "Increase staff motivation"
      },
      {
        "value": "Improve_training_for_personnel",
        "label": "Improve training for personnel"
      },
      {
        "value": "Provide_more_supplies_for_patients",
        "label": "Provide more supplies for patients; (please specify)"
      },
      {
        "value": "Decrease_cost_of_treatment",
        "label": "Decrease cost of treatment"
      },
      {
        "value": "Increase_awareness_of_program",
        "label": "Increase awareness of program"
      },
      {
        "value": "Engage_community",
        "label": "Engage community"
      },
      {
        "value": "Other",
        "label": "Other (please specify)"
      },
      {
        "value": "Dont_know",
        "label": "Don’t know"
      }
    ]
  },
  {
    "id": "other_supplies",
    "label": "8.3.1 Specify other supplies for patients",
    "required": true,
    "hint": "Check all that apply",
    "section": "Domain 8 - MMDP Challenges and feedback",
    "relevant": "selected(#form/domain_8/way_of_improving_services, 'Provide_more_supplies_for_patients')",
    "type": "text"
  },
  {
    "id": "other_specify",
    "label": "8.3.2 Other ways to improve services for lymphedema patients at this facility",
    "required": true,
    "hint": null,
    "section": "Domain 8 - MMDP Challenges and feedback",
    "relevant": "selected(#form/domain_8/way_of_improving_services, 'Other')",
    "type": "text"
  },
  {
    "id": "comments_8",
    "label": "8.4 Additional comments or clarification for section 8 (please include question number)",
    "required": false,
    "hint": null,
    "section": "Domain 8 - MMDP Challenges and feedback · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "demostration_intro",
    "label": "9.1 Please demonstrate for me all of the strategies you know for ongoing lymphedema management",
    "required": false,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "look_for_entry_lesions",
    "label": "Checked or instructed patient to look for entry lesions (e.g. between toes and in folds)",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "wash_the_affected_leg",
    "label": "Washed or instructed patient to wash the affected leg",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "Washed_the_leg_with_soap",
    "label": "Washed the leg with soap",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "Dried_the_leg",
    "label": "Dried the leg",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "proper_use_of_antibiotic_ointment",
    "label": "Instructed on proper use of antibiotic ointment/potassium permanganate",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "strategies_for_management_of_an_acute_attack",
    "label": "Instructed the patient on strategies for management of an acute attack",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "perform_hygiene_frequently",
    "label": "Instructed the patient on how frequently to perform hygiene",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "Washed_the_healthy_leg",
    "label": "Washed the healthy leg",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "Demonstrated_exercises",
    "label": "Demonstrated exercises",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "Demonstrated_elevation_techniques",
    "label": "Demonstrated elevation techniques",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "Counselled_on_shoe_use",
    "label": "Counselled on shoe use",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Demonstration",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Done_Thoroughly",
        "label": "Done Thoroughly"
      },
      {
        "value": "Done_but_incompletely",
        "label": "Done, but incompletely"
      },
      {
        "value": "Not_Performed",
        "label": "Not Performed"
      },
      {
        "value": "Not_Applicable",
        "label": "Not Applicable"
      }
    ]
  },
  {
    "id": "comments_9",
    "label": "9.2 Additional comments or clarification for section 9 (please include question number)",
    "required": false,
    "hint": null,
    "section": "Domain 9 - Demonstration · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "result2note",
    "label": "SECTION 2: Of 1 scored indicator, there is <output value=\"#form/calculated_values/results/result2\" /> issue to discuss",
    "required": false,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result3note",
    "label": "SECTION 3: Of the 2 scored indicators, there are <output value=\"#form/calculated_values/results/result3\" />issues  to discuss",
    "required": false,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result4note",
    "label": "SECTION 4: Of 1 scored indicator, there is <output value=\"#form/calculated_values/results/result4\" /> issue  to discuss",
    "required": false,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result5note",
    "label": "SECTION 5: Of the 2  scored indicators, there are <output value=\"#form/calculated_values/results/result5\" /> issues  to discuss",
    "required": false,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result6note",
    "label": "SECTION 6: Of 1 scored indicator, there is <output value=\"#form/calculated_values/results/result6\" /> issue  to discuss",
    "required": false,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result7note",
    "label": "SECTION 7: Of the 3 scored indicators, there are <output value=\"#form/calculated_values/results/result7\" /> issues  to discuss",
    "required": false,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "num_patient",
    "label": "How many patients do you want to interview?",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview",
    "relevant": null,
    "type": "number"
  },
  {
    "id": "intro_note",
    "label": "READ to facility director/point of contact: I would like to ask at least one—more than one is permissible—lymphedema patient at this facility some questions about lymphedema and acute attacks. The patient should be randomly selected from the patient register. The interview should take less than five minutes.",
    "required": false,
    "hint": null,
    "section": "Domain 10 - Patient Interview",
    "relevant": "#form/domain_10/num_patient > 0",
    "type": "note"
  },
  {
    "id": "Patient_Interview_repeat_note",
    "label": "↻ Repeat section: Patient Interview. (Enter values for each iteration; add additional rows as needed.)",
    "required": false,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Interview",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "patient_available",
    "label": "Is there a lymphoedema patient that is available?",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Interview",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "patient_avlb_note",
    "label": "READ:I would like to ask you some questions about how your [local word for lymphedema] is cared for at this facility. Your answers to the following questions will remain anonymous and will in no way affect the services you receive at this facility.",
    "required": false,
    "hint": null,
    "section": "Patient Interview · Patient Knowledge",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "ackowledged",
    "label": "This individual has verbally acknowledged that they are willing to participate in the following survey",
    "required": true,
    "hint": null,
    "section": "Patient Interview · Patient Knowledge",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "sex",
    "label": "Sex",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "male",
        "label": "Male"
      },
      {
        "value": "female",
        "label": "Female"
      }
    ]
  },
  {
    "id": "age",
    "label": "Age",
    "required": true,
    "hint": "In years",
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "number"
  },
  {
    "id": "strategies_preventing_acute_attacks",
    "label": "Please describe for me all of the strategies you know for preventing acute attacks [local word for acute attacks] and preventing the progression of [local word for lymphedema]",
    "required": true,
    "hint": "DO NOT READ THE ANSWERS, ASK THEM TO BE SPECIFIC, ENCOURAGE “ANYTHING ELSE?” UNTIL NOTHING FURTHER IS MENTIONED AND CHECK ALL THAT APPLY",
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "hygiene_washing_and_drying_of_affected_limb",
        "label": "Hygiene / Washing and drying of affected limb"
      },
      {
        "value": "wound_care_care_of_entry_lesions",
        "label": "Wound care/ care of entry lesions"
      },
      {
        "value": "elevation",
        "label": "Elevation"
      },
      {
        "value": "exercises",
        "label": "Exercises"
      },
      {
        "value": "shoe_use",
        "label": "Shoe use"
      },
      {
        "value": "prophylactic_creams",
        "label": "Prophylactic creams"
      },
      {
        "value": "prophylactic_systemic_antibiotics",
        "label": "Prophylactic systemic antibiotics"
      },
      {
        "value": "traditional_remedies",
        "label": "Traditional remedies (please specify)"
      },
      {
        "value": "other",
        "label": "Other (please specify)"
      },
      {
        "value": "dont_know",
        "label": "Don’t know any lymphedema prevention technique"
      }
    ]
  },
  {
    "id": "traditional_remedies_specify",
    "label": "Please specify traditional remedies to prevent acute attacks and progression of lymphedema",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": "selected(#form/domain_10/Patient_Interview/patient_knowledge/consent_given/strategies_preventing_acute_attacks, 'traditional_remedies')",
    "type": "text"
  },
  {
    "id": "other_strategies_2",
    "label": "Other strategies you know for preventing acute attacks [local word for acute attacks] and preventing the progression of [local word for lymphedema]",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": "selected(#form/domain_10/Patient_Interview/patient_knowledge/consent_given/strategies_preventing_acute_attacks, 'other')",
    "type": "text"
  },
  {
    "id": "strategies_treating_acute_attacks",
    "label": "Please describe for me all of the strategies you know for treating acute attacks",
    "required": true,
    "hint": "DO NOT READ THE ANSWERS, ASK THEM TO BE SPECIFIC, ENCOURAGE “ANYTHING ELSE?” UNTIL NOTHING FURTHER IS MENTIONED AND CHECK ALL THAT APPLY",
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "cool_leg",
        "label": "Cool leg in bucket of cool water or using a cold compress"
      },
      {
        "value": "visit_the_health_facility",
        "label": "Visit the health facility"
      },
      {
        "value": "rest",
        "label": "Rest"
      },
      {
        "value": "elevation",
        "label": "Elevation"
      },
      {
        "value": "avoid_exercises",
        "label": "Avoid exercises for duration of acute attack"
      },
      {
        "value": "drink_fluids",
        "label": "Drink fluids"
      },
      {
        "value": "Apply_antibiotics_to_skin",
        "label": "Apply antibiotics to skin"
      },
      {
        "value": "take_antibiotics",
        "label": "Take antibiotics by mouth"
      },
      {
        "value": "take_injectable_antibiotics",
        "label": "Take injectable antibiotics"
      },
      {
        "value": "traditional_remedies",
        "label": "Traditional remedies (please specify)"
      },
      {
        "value": "visiting_a_traditional_healer",
        "label": "Visiting a traditional healer"
      },
      {
        "value": "other_specify",
        "label": "Other (please specify)"
      },
      {
        "value": "dont_know",
        "label": "Don’t know any acute attack treatments"
      }
    ]
  },
  {
    "id": "traditional_remedies_treatment_specify",
    "label": "Please specify traditional remedies to treat acute attacks",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": "selected(#form/domain_10/Patient_Interview/patient_knowledge/consent_given/strategies_treating_acute_attacks, 'traditional_remedies')",
    "type": "text"
  },
  {
    "id": "other_strategies_acute_attacks",
    "label": "Other strategies you know for treatinng acute attacks",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": "selected(#form/domain_10/Patient_Interview/patient_knowledge/consent_given/strategies_treating_acute_attacks, 'other_specify')",
    "type": "text"
  },
  {
    "id": "wash_leg_in_a_specific_manner",
    "label": "Do you wash your leg in a specific manner with soap and water either independently or with the assistance of someone?",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "No",
        "label": "No"
      },
      {
        "value": "dontknow",
        "label": "Don't know"
      },
      {
        "value": "refused",
        "label": "Refused"
      }
    ]
  },
  {
    "id": "wash_leg_frequency",
    "label": "How often in the last 30 days did you wash your leg in a specific manner with soap and water?",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": "#form/domain_10/Patient_Interview/patient_knowledge/consent_given/wash_leg_in_a_specific_manner = 'yes'",
    "type": "select_one",
    "options": [
      {
        "value": "more_than_once_per_day",
        "label": "More than once per day"
      },
      {
        "value": "Once_Daily",
        "label": "Once Daily"
      },
      {
        "value": "More_than_once_per_week",
        "label": "More than once per week"
      },
      {
        "value": "Once_per_week",
        "label": "Once per week"
      },
      {
        "value": "Once_per_month",
        "label": "Once per month"
      },
      {
        "value": "More_than_once_per_month",
        "label": "More than once per month"
      }
    ]
  },
  {
    "id": "pain_warmth_swelling",
    "label": "Have you ever had pain, warmth, swelling and redness on either of your legs?",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "No",
        "label": "No"
      },
      {
        "value": "dontknow",
        "label": "Don't know"
      },
      {
        "value": "refused",
        "label": "Refused"
      }
    ]
  },
  {
    "id": "pain_warmth_swelling_frequency",
    "label": "How many times did you have pain, warmth, swelling or redness of your leg in the past 30 days?",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": "#form/domain_10/Patient_Interview/patient_knowledge/consent_given/pain_warmth_swelling = 'yes'",
    "type": "select_one",
    "options": [
      {
        "value": "none",
        "label": "None"
      },
      {
        "value": "1",
        "label": "1 time"
      },
      {
        "value": "2",
        "label": "2 times"
      },
      {
        "value": "3",
        "label": "3 times"
      },
      {
        "value": "4",
        "label": "4 times"
      },
      {
        "value": "more_than_4",
        "label": "More than 4"
      },
      {
        "value": "refused",
        "label": "Refused"
      },
      {
        "value": "dontknow",
        "label": "Don't know"
      }
    ]
  },
  {
    "id": "feelings_description",
    "label": "Which of the following best describes your feelings about your lymphedema in the past 30 days?",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "Excellent",
        "label": "Excellent"
      },
      {
        "value": "Very_good",
        "label": "Very good"
      },
      {
        "value": "Good",
        "label": "Good"
      },
      {
        "value": "Fair",
        "label": "Fair"
      },
      {
        "value": "Poor",
        "label": "Poor"
      }
    ]
  },
  {
    "id": "pleased_with_services",
    "label": "Overall are you pleased with [local word for lymphedema] services provided at this health facility?",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "very_satisfied",
        "label": "Very satisfied"
      },
      {
        "value": "satisfied",
        "label": "Satisfied"
      },
      {
        "value": "neutral",
        "label": "Neutral"
      },
      {
        "value": "dissatisfied",
        "label": "Dissatisfied"
      },
      {
        "value": "very_dissatisfied",
        "label": "Very dissatisfied"
      }
    ]
  },
  {
    "id": "improve_satisfaction",
    "label": "How can services be improved at this facility to improve your satisfaction?",
    "required": true,
    "hint": "Do not read the answers, ask them to be specific, encourage “anything else?”until nothing further is mentioned and check all that apply",
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "hr",
        "label": "Increase human resources"
      },
      {
        "value": "staff_training",
        "label": "Improved staff training"
      },
      {
        "value": "supplies",
        "label": "More supplies for patients"
      },
      {
        "value": "awareness",
        "label": "Implement an outreach program"
      },
      {
        "value": "cost_of_treatment",
        "label": "Decrease the cost of treatment"
      },
      {
        "value": "reputation",
        "label": "Increase the awareness of the program"
      },
      {
        "value": "patient_support_groups",
        "label": "Patient support groups"
      },
      {
        "value": "community",
        "label": "Engage the community"
      },
      {
        "value": "other",
        "label": "Other"
      },
      {
        "value": "dont_know",
        "label": "Don't know"
      }
    ]
  },
  {
    "id": "specify_supplies",
    "label": "Specify supplies needed for patients",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": "#form/domain_10/Patient_Interview/patient_knowledge/consent_given/improve_satisfaction = 'supplies'",
    "type": "text"
  },
  {
    "id": "other_ways_to_improve_your_satisfaction",
    "label": "Other ways to improve your satisfaction",
    "required": true,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": "#form/domain_10/Patient_Interview/patient_knowledge/consent_given/improve_satisfaction = 'other'",
    "type": "text"
  },
  {
    "id": "end_note_interview",
    "label": "This is the end of the interview, thank you for participating!",
    "required": false,
    "hint": null,
    "section": "Patient Knowledge · Consent given",
    "relevant": null,
    "type": "note"
  }
] as SAQuestion[];
