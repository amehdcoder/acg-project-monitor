// AUTO-GENERATED from HFAT XLSForm. Do not edit by hand.
import type { SAQuestion } from './definitions';

export const HFAT_ITEMS: SAQuestion[] = [
  {
    "id": "note1",
    "label": "Content: Section 1 asks basic questions about the healthcare facility.\n\nInformant: It is expected that a hospital administrator or staff member with managerial responsibilities should be able to answer these questions.",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Section 1",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "informant_1",
    "label": "Informant - Name",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Section 1",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "informant_1_designation",
    "label": "Informant - Designation",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Section 1",
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
        "value": "nigeria",
        "label": "Nigeria"
      }
    ]
  },
  {
    "id": "admin1",
    "label": "1.5.a Admin area 1 (State)",
    "required": true,
    "hint": " (enter value)",
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": null,
    "type": "text",
    "options": []
  },
  {
    "id": "admin2",
    "label": "1.5.b Admin area 2 (LGA)",
    "required": true,
    "hint": " (enter value)",
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": null,
    "type": "text",
    "options": []
  },
  {
    "id": "admin2_other",
    "label": "Other District",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": "#form/domain_1/background3/admin2 = 'AUTRES'",
    "type": "text"
  },
  {
    "id": "admin3",
    "label": "1.5.c Admin area 3 (Health Facility)",
    "required": true,
    "hint": " (enter value)",
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": null,
    "type": "text",
    "options": []
  },
  {
    "id": "admin3_other",
    "label": "Other Health Facility",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 1",
    "relevant": "#form/domain_1/background3/admin3 = 'AUTRES' or #form/domain_1/background3/admin2 = 'AUTRES'",
    "type": "text"
  },
  {
    "id": "GPS",
    "label": "Take GPS position automatically",
    "required": true,
    "hint": "GPS coordinates can only be collected outdoors! (GPS lat,lng)",
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
    "hint": " (enter value)",
    "section": "Domain 1 - Background Information · Background information - 2",
    "relevant": null,
    "type": "text",
    "options": []
  },
  {
    "id": "interviewer_other",
    "label": "1.3 Interviewer name",
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Background information - 2",
    "relevant": "#form/domain_1/background2/interviewer = 'Not Listed'",
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
        "value": "health_c",
        "label": "Health centre"
      },
      {
        "value": "subdist_comm_h",
        "label": "Sub-district/community hospital"
      },
      {
        "value": "district_h",
        "label": "District hospital"
      },
      {
        "value": "prov_reg_h",
        "label": "Provincial/regional hospital"
      },
      {
        "value": "national_h",
        "label": "National referral hospital"
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
    "required": true,
    "hint": null,
    "section": "Domain 1 - Background Information · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "note2",
    "label": "Content: Sections 2 to 8 ask basic questions about surgical procedures, training, infection prevention, as well as the availability of basic equipment and medicine.\n\nInformant: it is expected that a senior theatre nurse or surgical doctor should be able to answer these questions.",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Section 2",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "informant_2_write",
    "label": "Informant - Name",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Section 2",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "informant_2_write_designation",
    "label": "Informant - Designation",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Section 2",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "surgery_now",
    "label": "2.1 Does this facility perform hydrocele surgery?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 1",
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
    "id": "surgery_now_no",
    "label": "2.1.1 Specify why not",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 1",
    "relevant": "selected(#form/domain_2/surgery1/surgery_now, 'no')",
    "type": "text"
  },
  {
    "id": "surgerytype",
    "label": "2.2 If yes, which types of hydrocele surgeries (complicated and/or uncomplicated) are performed at this facility?",
    "required": true,
    "hint": "Read options and refer to note below to define complicated surgery\nComplicated cases include: (i) scrotal swellings other than hydrocele; (ii) hydrocele which does not transilluminate: e.g. haematocele, pyocele, chylocele, neoplasm; (iii) patients with medical co-morbidity",
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 1",
    "relevant": "selected(#form/domain_2/surgery1/surgery_now, 'yes')",
    "type": "select_one",
    "options": [
      {
        "value": "uncomplicated",
        "label": "Uncomplicated hydrocele surgery"
      },
      {
        "value": "complicated",
        "label": "Complicated hydrocele surgery"
      },
      {
        "value": "both",
        "label": "Uncomplicated AND complicated surgery"
      }
    ]
  },
  {
    "id": "performsurgery",
    "label": "2.3 How many staff members at the facility are currently able to perform hydrocele surgery?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 2",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "mo_hydsurgery",
    "label": "2.3.a Medical officers",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 2",
    "relevant": null,
    "type": "number"
  },
  {
    "id": "su_hydsurgery",
    "label": "2.3.b Surgeons",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 2",
    "relevant": null,
    "type": "number"
  },
  {
    "id": "other_hydsurgery",
    "label": "2.3.c Other medical staff",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 2",
    "relevant": null,
    "type": "number"
  },
  {
    "id": "other_hydsurgery_specify",
    "label": "2.3.1  Please specify other type of staff able to perform hydrocele surgery",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 2",
    "relevant": "#form/domain_2/hydsurgery/other_hydsurgery > 0",
    "type": "text"
  },
  {
    "id": "staff_trained_last_2_years",
    "label": "2.4 Have any staff who are currently working at this facility been trained or retrained in hydrocelectomies in the last 2 years?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 2",
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
      },
      {
        "value": "dont_know",
        "label": "Don't know"
      },
      {
        "value": "refusal",
        "label": "Refused"
      }
    ]
  },
  {
    "id": "checklist",
    "label": "2.5 Is a Surgical Safety Checklist used routinely in this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 3",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yesseen",
        "label": "Yes - Seen"
      },
      {
        "value": "yesnotseen",
        "label": "Yes - Not seen"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "checklist_source",
    "label": "2.5.1 Specify here the source of the Surgical Safety Checklist",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 3",
    "relevant": "#form/domain_2/surgery4/checklist = 'yesseen' or #form/domain_2/surgery4/checklist = 'yesnotseen'",
    "type": "text"
  },
  {
    "id": "checklist_notseen",
    "label": "2.5.2 Specify why not seen",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 3",
    "relevant": "selected(#form/domain_2/surgery4/checklist, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "anaesthesia_specify",
    "label": "2.6.1 Please specify other type of anaesthesia",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 4",
    "relevant": "selected(#form/domain_2/surgery5/anaesthesia, 'other')",
    "type": "text"
  },
  {
    "id": "observation",
    "label": "2.7 Does the facility have capacity to observe hydrocele patients for 72 hours following hydrocele surgery if required?",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Surgical procedures and training - 4",
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
    "id": "alt2_note",
    "label": "The following answers from section 2 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Note - Section 2",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_staff_trained_last_2_years",
    "label": "NO staff currently working at this facility have been trained or retrained in hydrocelectomy within the past 2 years",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Note - Section 2",
    "relevant": "not(selected(#form/domain_2/hydsurgery/staff_trained_last_2_years, 'yes'))",
    "type": "note"
  },
  {
    "id": "alt_checklist",
    "label": "A Surgical Safety Checklist is not used routinely in this facility (or it was not seen)",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Note - Section 2",
    "relevant": "not(selected(#form/domain_2/surgery4/checklist, 'yesseen'))",
    "type": "note"
  },
  {
    "id": "alt_observation",
    "label": "The facility does not have the capacity to post-operatively monitor hydrocele patients for 72 hours following hydrocele surgery",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Note - Section 2",
    "relevant": "selected(#form/domain_2/surgery5/observation, 'no')",
    "type": "note"
  },
  {
    "id": "comments_2",
    "label": "2.8 Additional comments or clarification for section 2 (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 2 - Surgical procedures and training · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "phone",
    "label": "3.1 Does the facility have a FUNCTIONING telephone that is available to call outside (e.g. for emergency transfers) at all times?",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Emergency patient transfer - 1",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "landline",
        "label": "Yes, landline"
      },
      {
        "value": "mobile",
        "label": "Yes, mobile phone"
      },
      {
        "value": "both",
        "label": "Yes, both"
      },
      {
        "value": "no",
        "label": "No"
      },
      {
        "value": "other",
        "label": "Other"
      }
    ]
  },
  {
    "id": "phone_specify",
    "label": "3.1.1 Please specify which kind of telephone is available",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Emergency patient transfer - 1",
    "relevant": "selected(#form/domain_3/emergencypatienttransfer1/phone, 'other')",
    "type": "text"
  },
  {
    "id": "ambulance",
    "label": "3.2 Does this facility have a FUNCTIONAL ambulance or other vehicle for emergency transportation for clients that is stationed at this facility or operates from this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Emergency patient transfer - 1",
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
    "id": "ambulance_fuel",
    "label": "3.3.a Is fuel for the ambulance or other emergency vehicle available today?",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Emergency patient transfer - 1",
    "relevant": "selected(#form/domain_3/emergencypatienttransfer1/ambulance, 'yes')",
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
    "id": "ambulance_other",
    "label": "3.3.b Does this facility have access to an ambulance or other vehicle for emergency transport for clients that is stationed at another facility or that operates from another facility in near proximity?",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Emergency patient transfer - 1",
    "relevant": "selected(#form/domain_3/emergencypatienttransfer1/ambulance, 'no')",
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
    "id": "ambulance_otherfacilityname",
    "label": "3.4 You have said that the facility has access to an emergency vehicle at a nearby facility. \n\nPlease specify here the NAME of the facility where the ambulance/ emergency vehicle is stationed",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Emergency patient transfer - 1",
    "relevant": "selected(#form/domain_3/emergencypatienttransfer1/ambulance_other, 'yes')",
    "type": "text"
  },
  {
    "id": "ambulance_otherfacilitydistance",
    "label": "3.4.a.  Please specify here the DISTANCE IN KILOMETRES of the facility where the ambulance/ emergency vehicle is stationed",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Emergency patient transfer - 1",
    "relevant": "selected(#form/domain_3/emergencypatienttransfer1/ambulance_other, 'yes')",
    "type": "text"
  },
  {
    "id": "alt3_note",
    "label": "The following answers from section 3 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Note - Section 3",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_phone",
    "label": "A functioning telephone is not available or it is not a landline or mobile phone",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Note - Section 3",
    "relevant": "selected(#form/domain_3/emergencypatienttransfer1/phone, 'no') or selected(#form/domain_3/emergencypatienttransfer1/phone, 'other')",
    "type": "note"
  },
  {
    "id": "alt_ambulance",
    "label": "A functioning ambulance is not available in this facility",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Note - Section 3",
    "relevant": "selected(#form/domain_3/emergencypatienttransfer1/ambulance, 'no')",
    "type": "note"
  },
  {
    "id": "comments_3",
    "label": "3.5 Additional comments or clarification for section 3 (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 3 - Emergency patient transfer · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "watersource",
    "label": "4.1. Is clean running water available in the surgery theatre?",
    "required": true,
    "hint": "(This question refers to the source of water for general purposes, not just for drinking)\n\nScoring based on UN definition of improved water source",
    "section": "Domain 4 - Infrastructure · Infrastructure - 1",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "piped_into_theatre",
        "label": "Piped into theatre"
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
    "section": "Domain 4 - Infrastructure · Infrastructure - 1",
    "relevant": "selected(#form/domain_4/infrastructure1/watersource, 'other')",
    "type": "text"
  },
  {
    "id": "watersource_location",
    "label": "4.2 Where is the main water supply for the facility located?",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Infrastructure - 1",
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
    "section": "Domain 4 - Infrastructure · Infrastructure - 1",
    "relevant": "#form/domain_4/infrastructure1/watersource != 'no'",
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
    "id": "electricsource",
    "label": "4.4 What is the facility’s main source of electricity?",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Infrastructure - 2",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "central",
        "label": "Central supply of electricity"
      },
      {
        "value": "generator",
        "label": "Generator (fuel or battery operated)"
      },
      {
        "value": "solar",
        "label": "Solar system"
      },
      {
        "value": "nosource",
        "label": "No electricity source"
      },
      {
        "value": "other",
        "label": "Other"
      }
    ]
  },
  {
    "id": "electricsource_specify",
    "label": "4.4.1 Please specify the electricity source",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Infrastructure - 2",
    "relevant": "selected(#form/domain_4/infrastructure2/electricsource, 'other')",
    "type": "text"
  },
  {
    "id": "electricsource2",
    "label": "4.5 Other than the main or primary source, does the facility have a secondary or backup source of electricity?",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Infrastructure - 2",
    "relevant": "not(selected(#form/domain_4/infrastructure2/electricsource, 'none'))",
    "type": "select_one",
    "options": [
      {
        "value": "yes",
        "label": "Yes"
      },
      {
        "value": "no",
        "label": "No"
      },
      {
        "value": "generator",
        "label": "Generator (fuel or battery operated)"
      },
      {
        "value": "solar",
        "label": "Solar system"
      },
      {
        "value": "battery",
        "label": "Battery supply"
      },
      {
        "value": "other",
        "label": "Other"
      }
    ]
  },
  {
    "id": "electricsource2type_specify",
    "label": "4.5.1.a Please specify the secondary electricity source",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Infrastructure - 2",
    "relevant": "selected(#form/domain_4/infrastructure2/electricsource2type, 'other')",
    "type": "text"
  },
  {
    "id": "alt4_note",
    "label": "The following answers from section 4 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Note - Section 4",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_watersource",
    "label": "The health facility does not have a suitable water source",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Note - Section 4",
    "relevant": "selected(#form/domain_4/infrastructure1/watersource, 'dontknow') or selected(#form/domain_4/infrastructure1/watersource, 'other') or selected(#form/domain_4/infrastructure1/watersource, 'surface_water') or selected(#form/domain_4/infrastructure1/watersource, 'unprotected_well') or #form/domain_4/infrastructure1/watersource = 'no'",
    "type": "note"
  },
  {
    "id": "alt_electricsource",
    "label": "The main source of electricity is not a central supply of electricity, a generator or a solar system",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Note - Section 4",
    "relevant": "selected(#form/domain_4/infrastructure2/electricsource, 'other') or selected(#form/domain_4/infrastructure2/electricsource, 'nosource')",
    "type": "note"
  },
  {
    "id": "comments_4",
    "label": "4.6 Additional comments or clarification for section 4 (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 4 - Infrastructure · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "medicine_b",
    "label": "Please show me the following medications and describe their availability at this facility.",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_sufficient",
    "label": "*Sufficient quantity is defined as maintaining enough supply of medications to meet current demand at the health facility.",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "corticosteroids",
    "label": "5a.1 Corticosteroids",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "adrenaline",
    "label": "5a.2 Adrenaline",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "frusemide",
    "label": "5a.3 Frusemide",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "sodium_bicarb",
    "label": "5a.4 Sodium bicarbonate injection",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "diazapam",
    "label": "5a.5 Diazepam injection",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "tetanus",
    "label": "5a.6 Tetanus toxoid 1 ampoule",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "amoxicillin",
    "label": "5a.7 Amoxicillin",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "metronidazole",
    "label": "5a.8 Metronidazole",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "ciprofloxacin",
    "label": "5a.9 Ciprofloxacin",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "paracetamol",
    "label": "5a.10 Paracetamol",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "nsaid",
    "label": "5a.11 Non-steroidal anti-inflammatory drugs such as diclofenac",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "opioid_medication",
    "label": "5a.12 Opioid pain medication",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "local_an",
    "label": "5a.13 Local anaesthetic (Bupivacaine OR Lignocaine)",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "saline_solution",
    "label": "5a.14 IV Saline Solution",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "other_medication_available",
    "label": "5a.15 Are there any other medications that you use to treat LF and that are available at least sometimes at this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
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
    "id": "other_medication_specify",
    "label": "5a.16 Please specify \"other\" medication available",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
    "relevant": "#form/domain_5a/other_medication_available = 'yes'",
    "type": "text"
  },
  {
    "id": "other_medication_description_availability",
    "label": "5a.17 Please describe the availability of this \"other\" medication",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines",
    "relevant": "#form/domain_5a/other_medication_available = 'yes'",
    "type": "text"
  },
  {
    "id": "comments_5a",
    "label": "5a.18 Additional comments or clarification for section 5a (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 5a - Essential Medicines · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "basic3_b",
    "label": "Please show me the following basic equipment (disposable) and describe their availability at this facility",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_sufficient",
    "label": "*Sufficient quantity is defined as maintaining enough supply of medications to meet current demand at the health facility.",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "syringe_10",
    "label": "5b.1 Disposable syringe Luer lock (10 mL)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "syringe_60",
    "label": "5b.2 Disposable syringe Luer lock (60mL)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "catheter_60",
    "label": "5b.3 Syringe catheter tip (60 mL)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "syringe_18g",
    "label": "5b.4 Disposable needles, 18-gauge",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "syringe_24g",
    "label": "5b.5 Disposable needles, 24-gauge",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "drapes",
    "label": "5b.6 Sterile wound drapes",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
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
    "label": "5b.7 Sterile wound towels",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "s_gowns",
    "label": "5b.8 Sterile surgical gowns for surgeon and assistant",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "s_cap",
    "label": "5b.9 Surgeon’s cap",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "s_mask",
    "label": "5b.10 Surgeon’s mask",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "apron",
    "label": "5b.11 Non-permeable apron for surgeons",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "trolleytowel",
    "label": "5b.12 Sterile trolley towel and back table cover",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "s_gloves",
    "label": "5b.13 Surgical gloves for surgeon and assistant",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "dressing",
    "label": "5b.14 Dressing materials (gauze, sterile)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "gauze",
    "label": "5b.15 Gauze",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "sutures",
    "label": "5b.16 Surgical sutures absorbable braided polyglactin (~Vicryl, Dexon) 2-0, 3-0, 4-0 (opened as necessary) 4-0 Monocryl or vicryl rapide)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "mesh",
    "label": "5b.17 Surgical mesh (for hernia)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "blades",
    "label": "5b.18 Surgical blades (size 15)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "bandage",
    "label": "5b.19 Elastic bandage or crepe gauze",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "plasters",
    "label": "5b.20 Medical tape",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "iv_saline",
    "label": "5b.21 IV infusion sets",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "cannula",
    "label": "5b.22 IV cannulas",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
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
    "label": "5b.23 Hand-washing soap/liquid soap",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "handrub",
    "label": "5b.24 Alcohol based hand rub",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "hand_brush",
    "label": "5b.25 Surgical impregnated handwash brushes",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "gloves",
    "label": "5b.26 Disposable latex gloves",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "sharp_box",
    "label": "5b.27 Sharps container (“safety box”)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "disinfectant",
    "label": "5b.28 Environmental disinfectant (e.g. chlorine, alcohol)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "iodine",
    "label": "5b.29 Povidone iodine solution for topical preparation OR Equivalent",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "other_disposable_available",
    "label": "5b.30 Are there any other supplies that you use to support hydrocele surgeries that are available at least sometimes at this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
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
    "id": "other_disposable_specify",
    "label": "5b.31 Please specify \"other\" disposable basic equipment available",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
    "relevant": "#form/domain_5b/other_disposable_available = 'yes'",
    "type": "text"
  },
  {
    "id": "other_disposable_description_availability",
    "label": "5b.32 Please describe the availability of this \"other\" disposable basic equipment",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable)",
    "relevant": "#form/domain_5b/other_disposable_available = 'yes'",
    "type": "text"
  },
  {
    "id": "comments_5b",
    "label": "5b.33 Additional comments or clarification for section 5b (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 5b - Basic equipment (disposable) · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "basic5c",
    "label": "Please show me the following basic equipment (non-disposable) and describe their availability at this facility",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable)",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_sufficient",
    "label": "*Sufficient quantity is defined as maintaining enough supply of medications to meet current demand at the health facility.",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable)",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "ambu_bag",
    "label": "5c.1 Ambu bag",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Monitoring equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "o2_mask",
    "label": "5c.2 Oxygen mask",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Monitoring equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "laryngoscope",
    "label": "5c.3 Laryngoscope",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Monitoring equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "endotracheal_tube",
    "label": "5c.4 Endotracheal tube",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Monitoring equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "adult_scales",
    "label": "5c.5 Adult weighing scale",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Monitoring equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "blood_pressure",
    "label": "5c.6 Blood pressure apparatus (may be digital or manual sphygmomanometer with stethoscope)",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Monitoring equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "pulse_oximeter",
    "label": "5c.7 Pulse oximeter",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Monitoring equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "thermometer",
    "label": "5c.8 Thermometer",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Monitoring equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "suction",
    "label": "5c.9 Suction apparatus",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "diathermy",
    "label": "5c.10 Surgical diathermy machine",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "electrocautery",
    "label": "5c.11 Electrocautery machine",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "forceps_sponge",
    "label": "5c.12 Sponge-holding forceps",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "scalpel",
    "label": "5c.13 Scalpel with blade",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "knife_handle",
    "label": "5c.14 Knife handle",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "dforceps_toothed",
    "label": "5c.15 Dissecting forceps, toothed",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "dforceps_non_toothed",
    "label": "5c.16 Dissecting forceps, non-toothed",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "towel_clips",
    "label": "5c.17 Towel clips",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "metzenbaum",
    "label": "5c.18 Metzenbaum scissors",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "trocar_cannula",
    "label": "5c.19 Trocar and cannula",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "c_artery_forceps",
    "label": "5c.20 Curved artery forceps",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "mayos",
    "label": "5c.21 Mayo’s scissors",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "s_artery_forceps",
    "label": "5c.22 Straight artery forceps",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "allis_forceps",
    "label": "5c.23 Allis forceps/clamps",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "kidney_tray",
    "label": "5c.24 Steel kidney tray/basin",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "steel_cup",
    "label": "5c.25 Small steel cup",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "needle_holder",
    "label": "5c.26 Needle holder",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "oxygen",
    "label": "5c.27 Oxygen cylinders",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "retractors",
    "label": "5c.28 Retractors (army/navy)",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "self_retaining_retractor",
    "label": "5c.29 Self-retaining retractor (hernia)",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "bin",
    "label": "5c.30 “Red bag” waste container",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "electric_scalpel",
    "label": "5c.31 Two mono or bipolar electric scalpels",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
        "value": "out",
        "label": "Currently stocked-out (c)"
      },
      {
        "value": "never_available",
        "label": "Never available (d)"
      }
    ]
  },
  {
    "id": "other_non_disposable_available",
    "label": "5c.32 Are there any other supplies that you use to support hydrocele surgeries that are available at least sometimes at this facility?",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
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
    "id": "other_disposable_specify",
    "label": "5c.33 Please specify \"other\" non disposable basic equipment available",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
    "relevant": "#form/domain_5c/other_non_disposable_available = 'yes'",
    "type": "text"
  },
  {
    "id": "other_non_disposable_description_availability",
    "label": "5c.33 Please describe the availability of this \"other\" non disposable basic equipment",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Surgical equipment",
    "relevant": "#form/domain_5c/other_non_disposable_available = 'yes'",
    "type": "text"
  },
  {
    "id": "comments_5c",
    "label": "5c.34 Additional comments or clarification for section 5c (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 5c - Basic equipment (non-disposable) · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "existing_system_for_identifying_and_quatifying",
    "label": "6.1 Does this facility have a system for identifying and quantifying the number of patients who have received a hydrocelectomy",
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
      },
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
    "label": "6.2.1 Other system is being used by this facility for identifying and quantifying the number of patients who have received a hydrocelectomy",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System",
    "relevant": "selected(#form/domain_6/system_used, 'other')",
    "type": "text"
  },
  {
    "id": "patient_presented_at_this_facility",
    "label": "6.3 Estimate how many patients have presented at this facility for hydrocele surgeries in the last 6 months",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System",
    "relevant": null,
    "type": "number"
  },
  {
    "id": "patients_with_hydrocelectomy",
    "label": "6.4 How many patients have been reported as having a hydrocelectomy in the last 6 months?",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System",
    "relevant": null,
    "type": "number"
  },
  {
    "id": "alt6_note",
    "label": "The following answers from section 6 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System · Note - Section 6",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_patient_tracking_system",
    "label": "This facility doesn't have a system for identifying and quantifying the number of patients who have received a hydrocelectomy",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System · Note - Section 6",
    "relevant": "not(selected(#form/domain_6/existing_system_for_identifying_and_quatifying, 'yes'))",
    "type": "note"
  },
  {
    "id": "alt_num_patient",
    "label": "No patients have been reported to have undergone hydrocelectomy in the past 6 months at this facility",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System · Note - Section 6",
    "relevant": "int(#form/domain_6/patients_with_hydrocelectomy) = 0",
    "type": "note"
  },
  {
    "id": "comments_6",
    "label": "6.5 Additional comments or clarification for section 6 (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 6 - Patient Tracking System · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "alt_sec7",
    "label": "This facility does not perform hydrocele surgeries",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice",
    "relevant": "not(selected(#form/domain_2/surgery1/surgery_now, 'yes'))",
    "type": "note"
  },
  {
    "id": "alt_intro_sec_7",
    "label": "READ to facility director/point of contact: I would like to ask any member of your facility who has been trained in hydrocelectomy a few questions about hydrocele practices",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Availability & Consent",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "staff_member_available",
    "label": "7.1 Is there a staff member who is responsible for hydrocelectomies that is available?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Availability & Consent",
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
    "label": "READ to member of facility: I would like to ask you a few questions about hydrocelectomies. Your answers will be completely anonymous and will in no way impact your status of employment.",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Availability & Consent",
    "relevant": "#form/domain_7/availability_consent_sec_7/staff_member_available = 'yes'",
    "type": "note"
  },
  {
    "id": "alt_consent",
    "label": "7.1.a Has the individual verbally acknowledged that they are willing to\nparticipate in the following survey?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Availability & Consent",
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
    "id": "complication_guide",
    "label": "7.2 Does the unit have protocols to support staff to distinguish between LF hydroceles and other causes of scrotal swelling (such as testicular tumour, epididymitis, lymphoedema of the scrotum)?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yesseen",
        "label": "Yes - Seen"
      },
      {
        "value": "yesnotseen",
        "label": "Yes - Not seen"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "complication_guide_notseen",
    "label": "7.2.1 Please specify why it was not seen",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
    "relevant": "selected(#form/domain_7/current_practice2/complication_guide, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "confirmatory_exam",
    "label": "7.3 Does the operating surgeon conduct confirmatory examination before the patient is brought to the operating theatre and before surgery is undertaken?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
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
    "id": "confirmatory_exam_no",
    "label": "7.3.1 Specify why not",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
    "relevant": "selected(#form/domain_7/current_practice2/confirmatory_exam, 'no')",
    "type": "text"
  },
  {
    "id": "ultrasound",
    "label": "7.4 Is pre-operative ultrasound used at this facility for differential diagnosis?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
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
    "id": "ultrasound_no",
    "label": "7.4.1 Specify why not",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
    "relevant": "selected(#form/domain_7/current_practice2/ultrasound, 'no')",
    "type": "text"
  },
  {
    "id": "ultrasound_other",
    "label": "7.4.2 What method is used for pre-operative assessment?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
    "relevant": "selected(#form/domain_7/current_practice2/ultrasound, 'no')",
    "type": "text"
  },
  {
    "id": "protocol_complic_noncomplic",
    "label": "7.5 Does the unit have protocols to support staff to distinguish between complicated and uncomplicated hydrocele cases?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yesseen",
        "label": "Yes - Seen"
      },
      {
        "value": "yesnotseen",
        "label": "Yes - Not seen"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "protocol_complic_noncomplic_notseen",
    "label": "7.5.1 Specify why it was not seen",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
    "relevant": "selected(#form/domain_7/current_practice2/protocol_complic_noncomplic, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "procedure_referal",
    "label": "7.6 Does the facility have procedures to refer complicated cases?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
    "relevant": "selected(#form/domain_2/surgery1/surgerytype, 'uncomplicated')",
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
    "id": "procedure_referal_detail",
    "label": "7.7 Please specify the referral unit and process for  transferring complicated cases",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 1",
    "relevant": "selected(#form/domain_7/current_practice2/procedure_referal, 'yes')",
    "type": "text"
  },
  {
    "id": "preoptests",
    "label": "Does the facility provide the following as part of its preoperative assessment for hydrocele?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Preoperative assessment",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "systemic",
    "label": "7.8 Evaluation of systemic illnesses (e.g. history of diabetes mellitus, hypertension, angina)",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Preoperative assessment",
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
    "id": "haemoglobin2",
    "label": "7.9 Haemoglobin estimation",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Preoperative assessment",
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
    "id": "urinalysis",
    "label": "7.10 Urinalysis – glucose (to rule out diabetes)",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Preoperative assessment",
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
    "id": "blood_glucose2",
    "label": "7.11 Measurement of blood glucose",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Preoperative assessment",
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
    "id": "blood_pressure2",
    "label": "7.12 Measurement of blood pressure",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Preoperative assessment",
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
    "id": "lignocaine",
    "label": "7.13 Lignocaine sensitivity test (where indicated)",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Preoperative assessment",
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
    "id": "explanation",
    "label": "7.14 Explanation of procedure and informed consent",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Preoperative assessment",
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
    "id": "anaesthesia_simple_specify",
    "label": "7.15.1 Please specify other type of anaesthesia",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 2",
    "relevant": "selected(#form/domain_7/current_practice3/anaesthesia_simple, 'other')",
    "type": "text"
  },
  {
    "id": "anaesthesia_complicated_specify",
    "label": "7.16.1 Please specify other type of anaesthesia",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 2",
    "relevant": "selected(#form/domain_7/current_practice3/anaesthesia_complicated, 'other')",
    "type": "text"
  },
  {
    "id": "method_simple_specify",
    "label": "7.17.1 Please specify other method of surgery",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 3",
    "relevant": "selected(#form/domain_7/current_practice4/method_simple, 'other')",
    "type": "text"
  },
  {
    "id": "method_complicated_specify",
    "label": "7.18.1 Please specify other method of surgery",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 3",
    "relevant": "selected(#form/domain_7/current_practice4/method_complicated, 'other')",
    "type": "text"
  },
  {
    "id": "antibiotictime",
    "label": "7.19 How many hours before hydrocele surgery are pre-operative antibiotics administered?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 4",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "time_0_6",
        "label": "0-6 hours"
      },
      {
        "value": "time_6_12",
        "label": "6-12 hours"
      },
      {
        "value": "time_greaterthan12",
        "label": "&gt;12 hours"
      },
      {
        "value": "time_none",
        "label": "No pre-operative antibiotics administered"
      }
    ]
  },
  {
    "id": "five_day_antibiotics",
    "label": "7.20 Are antibiotics continued for a total duration of at least 5 days following hydrocele surgery?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 4",
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
    "id": "inpatienttime",
    "label": "7.21 Following hydrocele surgery, for how long do patients typically remain as inpatients?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 5",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "in_0_day",
        "label": "Discharged same day"
      },
      {
        "value": "in_1_day",
        "label": "1 day"
      },
      {
        "value": "in_2_day",
        "label": "2 days"
      },
      {
        "value": "in_3_day",
        "label": "3 days"
      },
      {
        "value": "in_3more_day",
        "label": "Over 3 days"
      }
    ]
  },
  {
    "id": "outpatientinterval",
    "label": "7.22 Following hydrocele surgery, after what interval does the facility routinely provide first outpatient follow-up?",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Current hydrocele surgery practice - 5",
    "relevant": "selected(#form/domain_2/surgery1/surgery_now, 'yes')",
    "type": "select_one",
    "options": [
      {
        "value": "out_1_10_day",
        "label": "1 to 10 days"
      },
      {
        "value": "out_11_30_day",
        "label": "11 days to 1 month"
      },
      {
        "value": "out_month",
        "label": "&gt;1 month"
      },
      {
        "value": "none",
        "label": "No routine follow-up provided"
      }
    ]
  },
  {
    "id": "alt10_note",
    "label": "The following answers from section 7 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_complication_guide",
    "label": "The unit does not have protocols to support staff to distinguish between LF hydroceles and other causes of scrotal swelling (or were not seen)",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "not(selected(#form/domain_7/current_practice2/complication_guide, 'yesseen'))",
    "type": "note"
  },
  {
    "id": "alt_confirmatory_exam",
    "label": "The operating surgeon does not conduct confirmatory examination before the patient is brought to the operating theatre and before surgery is undertaken",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "selected(#form/domain_7/current_practice2/confirmatory_exam, 'no')",
    "type": "note"
  },
  {
    "id": "alt_ultrasound",
    "label": "Pre-operative ultrasound is not used at this facility for differential diagnosis",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "selected(#form/domain_7/current_practice2/ultrasound, 'no')",
    "type": "note"
  },
  {
    "id": "alt_protocol_complic_noncomplic",
    "label": "The unit does not have protocols to support staff to distinguish between complicated and uncomplicated hydrocele cases (or were not seen)",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "not(selected(#form/domain_7/current_practice2/protocol_complic_noncomplic, 'yesseen'))",
    "type": "note"
  },
  {
    "id": "alt_systemic",
    "label": "The preoperative assessment for hydrocelectomies does not include an evaluation of systemic illnesses",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "selected(#form/domain_7/pre_op_assessment/systemic, 'no')",
    "type": "note"
  },
  {
    "id": "alt_haemoglobin2",
    "label": "The preoperative assessment for hydrocelectomies does not include a haemoglobin estimation",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "selected(#form/domain_7/pre_op_assessment/haemoglobin2, 'no')",
    "type": "note"
  },
  {
    "id": "alt_urinalysis",
    "label": "The preoperative assessment for hydrocelectomies does not include an urinalysis – glucose",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "selected(#form/domain_7/pre_op_assessment/urinalysis, 'no')",
    "type": "note"
  },
  {
    "id": "alt_blood_glucose2",
    "label": "The preoperative assessment for hydrocelectomies does not include a measurement of blood glucose",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "selected(#form/domain_7/pre_op_assessment/blood_glucose2, 'no')",
    "type": "note"
  },
  {
    "id": "alt_blood_pressure2",
    "label": "The preoperative assessment for hydrocelectomies does not include a measurement of blood pressure",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "selected(#form/domain_7/pre_op_assessment/blood_pressure2, 'no')",
    "type": "note"
  },
  {
    "id": "alt_lignocaine",
    "label": "The preoperative assessment for hydrocelectomies does not include a lignocaine sensitivity test (where indicated)",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "selected(#form/domain_7/pre_op_assessment/lignocaine, 'no')",
    "type": "note"
  },
  {
    "id": "alt_explanation",
    "label": "The preoperative assessment for hydrocelectomies does not include an explanation of procedure and informed consent",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Note - Section 7",
    "relevant": "selected(#form/domain_7/pre_op_assessment/explanation, 'no')",
    "type": "note"
  },
  {
    "id": "comments_7",
    "label": "7.23 Additional comments or clarification for section 7 (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 7 - Current hydrocele practice · Comments",
    "relevant": "#form/domain_7/availability_consent_sec_7/alt_consent = 'yes'",
    "type": "text"
  },
  {
    "id": "infection_guidelines",
    "label": "8.1 Does this facility have any guidelines on standard precautions for infection prevention?",
    "required": true,
    "hint": "Ask to see guidelines",
    "section": "Domain 8 - Infection prevention · Infection prevention - 1",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yesseen",
        "label": "Yes - Seen"
      },
      {
        "value": "yesnotseen",
        "label": "Yes - Not seen"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "infection_guidelines_notseen",
    "label": "8.1.1 Specify why they were not seen",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 1",
    "relevant": "selected(#form/domaine_8/infection1/infection_guidelines, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "recycle",
    "label": "8.2 Does this facility have a functional process to sterilise / recycle surgical instruments?",
    "required": true,
    "hint": "Ask to view",
    "section": "Domain 8 - Infection prevention · Infection prevention - 2",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yesseen",
        "label": "Yes - Seen"
      },
      {
        "value": "yesnotseen",
        "label": "Yes - Not seen"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "recycle_specify",
    "label": "8.2.1 Please specify the process",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 2",
    "relevant": "selected(#form/domaine_8/infection2/recycle, 'yesseen') or selected(#form/domaine_8/infection2/recycle, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "recycle_notseen",
    "label": "8.2.2 Please specify why it was not seen",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 2",
    "relevant": "selected(#form/domaine_8/infection2/recycle, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "recycle_no",
    "label": "6.3.3 Please specify why not",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 2",
    "relevant": "selected(#form/domaine_8/infection2/recycle, 'no')",
    "type": "text"
  },
  {
    "id": "disposal_sharps",
    "label": "8.3 Does the facility have a functional process to finally dispose of sharps waste (e.g. filled sharps boxes)?",
    "required": true,
    "hint": "Ask to view",
    "section": "Domain 8 - Infection prevention · Infection prevention - 3",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yesseen",
        "label": "Yes - Seen"
      },
      {
        "value": "yesnotseen",
        "label": "Yes - Not seen"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "disposal_sharps_specify",
    "label": "8.3.1 Please specify the process",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 3",
    "relevant": "selected(#form/domaine_8/infection3/disposal_sharps, 'yesseen') or selected(#form/domaine_8/infection3/disposal_sharps, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "disposal_sharps_notseen",
    "label": "8.3.2 Please specify why it was not seen",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 3",
    "relevant": "selected(#form/domaine_8/infection3/disposal_sharps, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "disposal_sharps_no",
    "label": "8.3.3 Please specify why not",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 3",
    "relevant": "selected(#form/domaine_8/infection3/disposal_sharps, 'no')",
    "type": "text"
  },
  {
    "id": "disposal_medical",
    "label": "8.4 Does the facility have a functional process to finally dispose of medical waste other than sharps waste?",
    "required": true,
    "hint": "Ask to view",
    "section": "Domain 8 - Infection prevention · Infection prevention - 4",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "yesseen",
        "label": "Yes - Seen"
      },
      {
        "value": "yesnotseen",
        "label": "Yes - Not seen"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "disposal_medical_specify",
    "label": "8.4.1 Please specify the process",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 4",
    "relevant": "selected(#form/domaine_8/infection4/disposal_medical, 'yesseen') or selected(#form/domaine_8/infection4/disposal_medical, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "disposal_medical_notseen",
    "label": "8.4.2 Please specify why it was not seen",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 4",
    "relevant": "selected(#form/domaine_8/infection4/disposal_medical, 'yesnotseen')",
    "type": "text"
  },
  {
    "id": "disposal_medical_no",
    "label": "8.4.3 Please specify why not",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Infection prevention - 4",
    "relevant": "selected(#form/domaine_8/infection4/disposal_medical, 'no')",
    "type": "text"
  },
  {
    "id": "alt6_note",
    "label": "The following answers from section 8 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Note - Section 8",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_infection_guidelines",
    "label": "This facility does not have any guidelines on standard precautions for infection prevention (or were not seen)",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Note - Section 8",
    "relevant": "not(selected(#form/domaine_8/infection1/infection_guidelines, 'yesseen'))",
    "type": "note"
  },
  {
    "id": "alt_recycle",
    "label": "The process the facility use to sterilise/recycle surgical instruments is not currently of the correct standard or not seen",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Note - Section 8",
    "relevant": "not(selected(#form/domaine_8/infection2/recycle, 'yesseen'))",
    "type": "note"
  },
  {
    "id": "alt_disposal_sharps",
    "label": "The method the facility uses to dispose of sharps waste is not currently of the correct standard or not seen",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Note - Section 8",
    "relevant": "not(selected(#form/domaine_8/infection3/disposal_sharps, 'yesseen'))",
    "type": "note"
  },
  {
    "id": "alt_disposal_medical",
    "label": "The method the facility uses to dispose of non sharps medical waste is not currently of the correct standard or not seen",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Note - Section 8",
    "relevant": "not(selected(#form/domaine_8/infection4/disposal_medical, 'yesseen'))",
    "type": "note"
  },
  {
    "id": "comments_8",
    "label": "8.5 Additional comments or clarification for section 6 (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 8 - Infection prevention · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "note2",
    "label": "Content: This section asks about laboratory capacity at the facility.\n\nInformant:  It is expected that a hospital administrator or laboratory staff member should be able to answer these questions. \"",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 1",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "informant_4_check",
    "label": "Is the staff member answering this section still <output value=\"#form/domain_1/intro/informant_1\" /> ?",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 1",
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
    "id": "informant_4_write",
    "label": "Informant - Name",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 1",
    "relevant": "selected(#form/domaine_9/laboratory_capacity1/informant_4_check, 'no')",
    "type": "text"
  },
  {
    "id": "informant_4_write_designation",
    "label": "Informant - Designation",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 1",
    "relevant": "selected(#form/domaine_9/laboratory_capacity1/informant_4_check, 'no')",
    "type": "text"
  },
  {
    "id": "onsite_tests",
    "label": "Does this facility conduct the following tests? Either onsite or through an arrangement with a nearby facility",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "haemoglobin",
    "label": "9.1 Haemoglobin testing  (Colorimeter OR haemoglobinometer OR hemocue)",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "onsite",
        "label": "Yes - Onsite"
      },
      {
        "value": "offsite",
        "label": "Yes - Nearby facility"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "offsite_facility_haemoglobin",
    "label": "9.1.a Haemoglobin test done in a nearby facility - Please state the name of the alternative laboratory and the distance in kilometres from the health facility being visited.",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": "selected(#form/domaine_9/laboratory_capacity2/haemoglobin, 'offsite')",
    "type": "text"
  },
  {
    "id": "bloodglucose",
    "label": "9.2 Blood glucose tests using a glucometer (Glucometer AND glucometer test strips)",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "onsite",
        "label": "Yes - Onsite"
      },
      {
        "value": "offsite",
        "label": "Yes - Nearby facility"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "offsite_facility_bloodglucose",
    "label": "9.2.a Blood glucose test done in a nearby facility - Please state the name of the alternative laboratory and the distance in kilometres from the health facility being visited.",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": "selected(#form/domaine_9/laboratory_capacity2/bloodglucose, 'offsite')",
    "type": "text"
  },
  {
    "id": "urineglucose",
    "label": "9.3 Urine dipstick - glucose",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "onsite",
        "label": "Yes - Onsite"
      },
      {
        "value": "offsite",
        "label": "Yes - Nearby facility"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "offsite_facility_urineglucose",
    "label": "9.3.a Urine dipstick test done in a nearby facility - Please state the name of the alternative laboratory and the distance in kilometres from the health facility being visited.",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": "selected(#form/domaine_9/laboratory_capacity2/urineglucose, 'offsite')",
    "type": "text"
  },
  {
    "id": "malaria",
    "label": "9.4 Malaria rapid diagnostic test",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "onsite",
        "label": "Yes - Onsite"
      },
      {
        "value": "offsite",
        "label": "Yes - Nearby facility"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "offsite_facility_malaria",
    "label": "9.4.a Malaria rapid diagnostic test done in a nearby facility - Please state the name of the alternative laboratory and the distance in kilometres from the health facility being visited.",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": "selected(#form/domaine_9/laboratory_capacity2/malaria, 'offsite')",
    "type": "text"
  },
  {
    "id": "hiv",
    "label": "9.5 HIV Screening",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "onsite",
        "label": "Yes - Onsite"
      },
      {
        "value": "offsite",
        "label": "Yes - Nearby facility"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "offsite_facility_hiv",
    "label": "9.5.a HIV screening test done in a nearby facility - Please state the name of the alternative laboratory and the distance in kilometres from the health facility being visited.",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": "selected(#form/domaine_9/laboratory_capacity2/hiv, 'offsite')",
    "type": "text"
  },
  {
    "id": "coagulation",
    "label": "9.6 General blood clotting tests (coagulation)",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "onsite",
        "label": "Yes - Onsite"
      },
      {
        "value": "offsite",
        "label": "Yes - Nearby facility"
      },
      {
        "value": "no",
        "label": "No"
      }
    ]
  },
  {
    "id": "offsite_facility_coagulation",
    "label": "9.6.a General blood clotting tests done in a nearby facility - Please state the name of the alternative laboratory and the distance in kilometres from the health facility being visited.",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Laboratory Capacity - 2",
    "relevant": "selected(#form/domaine_9/laboratory_capacity2/coagulation, 'offsite')",
    "type": "text"
  },
  {
    "id": "alt9_note",
    "label": "The following answers from section 9 do not meet the requirements. Please discuss with the informant to consider any actions that are planned or required.",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Note - Section 9",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "alt_haemoglobin",
    "label": "Haemoglobin testing is not available in the health facility",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Note - Section 9",
    "relevant": "not(selected(#form/domaine_9/laboratory_capacity2/haemoglobin, 'onsite'))",
    "type": "note"
  },
  {
    "id": "alt_bloodglucose",
    "label": "Blood glucose tests using a glucometer is not available in the health facility",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Note - Section 9",
    "relevant": "not(selected(#form/domaine_9/laboratory_capacity2/bloodglucose, 'onsite'))",
    "type": "note"
  },
  {
    "id": "alt_urineglucose",
    "label": "Urine dipstick - glucose is not available, either here or at a nearby facility",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Note - Section 9",
    "relevant": "not(selected(#form/domaine_9/laboratory_capacity2/urineglucose, 'onsite'))",
    "type": "note"
  },
  {
    "id": "alt_malaria",
    "label": "Malaria rapid diagnostic test is not available in the health facility",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Note - Section 9",
    "relevant": "not(selected(#form/domaine_9/laboratory_capacity2/malaria, 'onsite'))",
    "type": "note"
  },
  {
    "id": "alt_hiv",
    "label": "HIV screening is not available in the health facility",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Note - Section 9",
    "relevant": "not(selected(#form/domaine_9/laboratory_capacity2/hiv, 'onsite'))",
    "type": "note"
  },
  {
    "id": "alt_coagulation",
    "label": "General blood clotting tests (coagulation) is not available in the health facility",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Note - Section 9",
    "relevant": "not(selected(#form/domaine_9/laboratory_capacity2/coagulation, 'onsite'))",
    "type": "note"
  },
  {
    "id": "comments_9",
    "label": "9.7 Additional comments or clarification for section 9 (please include question number)",
    "required": true,
    "hint": null,
    "section": "Domain 9 - Laboratory Capacity · Comments",
    "relevant": null,
    "type": "text"
  },
  {
    "id": "result2note",
    "label": "SECTION 2: Of the 3 scored indicators, there are <output value=\"#form/calculated_values/resultats_calc/result2\" />  issues to discuss",
    "required": true,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result3note",
    "label": "SECTION 3: Of the 2 scored indicators, there are <output value=\"#form/calculated_values/resultats_calc/result3\" /> issues  to discuss",
    "required": true,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result4note",
    "label": "SECTION 4: Of the 4 scored indicators, there are <output value=\"#form/calculated_values/resultats_calc/result4\" />  issues  to discuss",
    "required": true,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result5anote",
    "label": "SECTION 5a: Of the 14  required medicines, <output value=\"#form/calculated_values/resultats_calc/result5a\" /> are not regularly procured",
    "required": true,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result5bnote",
    "label": "SECTION 5b: Of the 29 pieces of required equipment: <output value=\"#form/calculated_values/resultats_calc/result5b\" /> are not regularly procured",
    "required": true,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result5cnote",
    "label": "SECTION 5c: Of the 30 pieces of required equipment, <output value=\"#form/calculated_values/resultats_calc/result5c\" /> are not regularly procured",
    "required": true,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result6note",
    "label": "SECTION 6: Of the 2  scored indicators, there are <output value=\"#form/calculated_values/resultats_calc/result6\" /> issues  to discuss",
    "required": true,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result7note",
    "label": "SECTION 7: Of the 11 scored indicators, there are <output value=\"#form/calculated_values/resultats_calc/result7\" /> issues to discuss",
    "required": true,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result8note",
    "label": "SECTION 8: Of the 4 scored indicators, there are <output value=\"#form/calculated_values/resultats_calc/result8\" /> issues  to discuss",
    "required": true,
    "hint": null,
    "section": "Results",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "result9note",
    "label": "SECTION 9: Of the 6 scored indicators, there are <output value=\"#form/calculated_values/resultats_calc/result9\" /> issues  to discuss",
    "required": true,
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
    "label": "READ to facility director/point of contact: I would like to ask at least one—more than one is permissible—hydrocele patient at this facility some questions about hydrocele and acute attacks. The patient should be randomly selected from the patient register. The interview should take less than five minutes.",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview",
    "relevant": "#form/domain_10/num_patient > 0",
    "type": "note"
  },
  {
    "id": "patient_available",
    "label": "Is there a hydrocele patient that is available?",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview",
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
    "label": "READ:I would like to ask you some questions about how your [local word for hydrocele] is cared for at this facility. Your answers to the following questions will remain anonymous and will in no way affect the services you receive at this facility.",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge",
    "relevant": null,
    "type": "note"
  },
  {
    "id": "ackowledged",
    "label": "This individual has verbally acknowledged that they are willing to participate in the following survey",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge",
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
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
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
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": null,
    "type": "number"
  },
  {
    "id": "provide_knowledge",
    "label": "Do you think this facility provided you with the knowledge and resources to make an informed decision regarding hydrocele surgery?",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
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
      },
      {
        "value": "dont_know",
        "label": "Don't know"
      },
      {
        "value": "refusal",
        "label": "Refuse to answer"
      }
    ]
  },
  {
    "id": "general_satisfaction_with_surgery",
    "label": "General satisfaction with surgery",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "no_problems",
        "label": "I had no problems after the operation and I am happy to have had this surgery"
      },
      {
        "value": "some_problems",
        "label": "I encountered some problems following the operation, but I am satisfied to have undergone this surgery"
      },
      {
        "value": "dont_know",
        "label": "I don't know if I'm happy to have had this surgery"
      },
      {
        "value": "refuse_to_be_operated",
        "label": "I wish I had not had this surgery (please explain)"
      }
    ]
  },
  {
    "id": "reason_refuse_to_be_operated",
    "label": "Please explain why you would have preferred not to have had this surgery",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": "#form/domain_10/patient_interview/patient_knowledge/consent_given/general_satisfaction_with_surgery = 'refuse_to_be_operated'",
    "type": "text"
  },
  {
    "id": "changes_in_the_economic_situation",
    "label": "Changes in the economic situation after surgery",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "significantly_improved_economic_situation",
        "label": "The surgery has significantly improved my economic situation"
      },
      {
        "value": "improved_economic_situation",
        "label": "The surgery improved my economic situation, but nothing more"
      },
      {
        "value": "had_no_effect_on_economic_situation",
        "label": "The surgery had no effect on my economic situation"
      },
      {
        "value": "worse_economic_situation",
        "label": "The surgery made my economic situation worse (please explain):"
      }
    ]
  },
  {
    "id": "reason_worse_economic_situation",
    "label": "Please explain why the surgery made your economic situation worse",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": "#form/domain_10/patient_interview/patient_knowledge/consent_given/changes_in_the_economic_situation = 'worse_economic_situation'",
    "type": "text"
  },
  {
    "id": "changes_in_family_life",
    "label": "Changes in family life following surgery",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": null,
    "type": "select_one",
    "options": [
      {
        "value": "significantly_improved_family_life",
        "label": "The surgery has significantly improved my family life"
      },
      {
        "value": "improved_family_life",
        "label": "The surgery improved my family life, but nothing more"
      },
      {
        "value": "had_no_effect_on_family_life",
        "label": "The surgery had no effect on my family life"
      },
      {
        "value": "worse_family_life",
        "label": "The surgery made my family life worse (please explain):"
      }
    ]
  },
  {
    "id": "reason_worse_family_life",
    "label": "Please explain why the surgery made your family life worse",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": "#form/domain_10/patient_interview/patient_knowledge/consent_given/changes_in_family_life = 'worse_family_life'",
    "type": "text"
  },
  {
    "id": "specify_supplies",
    "label": "Specify supplies needed for patients",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": "#form/domain_10/patient_interview/patient_knowledge/consent_given/improve_satisfaction = 'supplies'",
    "type": "text"
  },
  {
    "id": "other_ways_to_improve_your_satisfaction",
    "label": "Other ways to improve your satisfaction",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": "#form/domain_10/patient_interview/patient_knowledge/consent_given/improve_satisfaction = 'other'",
    "type": "text"
  },
  {
    "id": "end_note_interview",
    "label": "This is the end of the interview, thank you for participating!",
    "required": true,
    "hint": null,
    "section": "Domain 10 - Patient Interview · Patient Knowledge · Consent given",
    "relevant": null,
    "type": "note"
  }
];
