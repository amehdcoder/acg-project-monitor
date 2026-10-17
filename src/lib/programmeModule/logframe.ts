// CiSKuLA-2 (G00094) Logical Framework — "Scaling up integrated, holistic and
// person-centred care in Nigeria". Structured from the uploaded Logframe1.xlsx.
// Indicators with an `autoKey` are pre-filled from the Longitudinal Beneficiary
// Records; all values remain editable by the reporting Programme Officer.

export type AutoKey =
  | "people_accessing_services"
  | "pwd_accessing_services"
  | "people_screened"
  | "people_treated"
  | "referral_completion"
  | "eye_screenings"
  | "eye_surgeries"
  | "spectacles_distributed"
  | "followup_visits"
  | "home_visits"
  | "mhpss_services"
  | "morbidity_services"
  | "completed_referrals"
  | "ccfm_resolved_pct"
  | "ccfm_cases"
  | "livelihood_participants"
  | "livelihood_assessed";

export interface LogframeIndicator {
  code: string;
  title: string;
  mov?: string;
  baseline?: string;
  targets: (string | null)[]; // Year 1..4
  totalTarget?: string;
  disaggregation?: string[];
  autoKey?: AutoKey;
  isPercent?: boolean;
}

export interface LogframeActivity {
  code: string;
  title: string;
  indicator: string;
  mov?: string;
  targets: (string | null)[];
  totalTarget?: string;
  disaggregation?: string[];
  autoKey?: AutoKey;
  isPercent?: boolean;
}

export interface LogframeResult {
  key: string;
  title: string;
  indicators: LogframeIndicator[];
  activities: LogframeActivity[];
}

export interface LogframeObjective {
  key: string;
  title: string;
  statement: string;
  tone: "blue" | "teal" | "amber";
  results: LogframeResult[];
}

export const LOGFRAME_PROJECT = {
  id: "G00094",
  name: "Scaling up integrated, holistic and person-centred care in Nigeria (CiSKuLA-2)",
  country: "Nigeria",
  impact:
    "To contribute to the reduction of avoidable blindness, NTD-related morbidity, disability, psychosocial distress, and poverty in Kano and Jigawa States",
};

export const LOGFRAME: LogframeObjective[] = [
  {
    key: "so1",
    title: "Specific Objective 1",
    statement:
      "Improved access to and utilization of integrated, inclusive and gender-responsive Eye Health, NTD, Mental Health and WASH services",
    tone: "blue",
    results: [
      {
        key: "so1-outcome",
        title: "Outcome indicators",
        indicators: [
          {
            code: "SO1.1",
            title: "Number of supported facilities providing integrated and disability-inclusive Eye Health, NTD, Mental Health and WASH services",
            mov: "DHIS2, Facility registers, Accessibility assessment reports",
            baseline: "1 (ECWA Eye Hospital)",
            targets: ["1", "114", "114", "114"],
            totalTarget: "114",
            disaggregation: ["State", "LGA", "Ward"],
          },
          {
            code: "SO1.2",
            title: "Increase in number of people accessing integrated health services",
            mov: "DHIS2, Facility registers",
            baseline: "0",
            targets: ["620", "1505", "1355", "1155"],
            totalTarget: "4635",
            disaggregation: ["Gender", "Age band", "Disease condition", "Impairment / Disability type"],
            autoKey: "people_accessing_services",
          },
          {
            code: "SO1.3",
            title: "Increase in number of persons with disabilities accessing supported services",
            mov: "DHIS2, Facility registers",
            baseline: "0",
            targets: ["62", "150.5", "135.5", "115.5"],
            totalTarget: "463.5",
            disaggregation: ["Gender", "Age band", "Disease condition", "Impairment / Disability type"],
            autoKey: "pwd_accessing_services",
          },
        ],
        activities: [],
      },
      {
        key: "so1-r1",
        title: "Result 1 — Strengthened health systems governance and coordination for integrated healthcare delivery",
        indicators: [
          {
            code: "SO1.R1.1",
            title: "Number of functional integrated health steering committees",
            mov: "Meeting minutes, Attendance records",
            baseline: "0",
            targets: ["2", "3", "3", "3"],
            totalTarget: "3",
            disaggregation: ["Gender", "Impairment / Disability type", "Stakeholder type"],
          },
          {
            code: "SO1.R1.2",
            title: "Number of facilities implementing integrated referral pathways",
            mov: "Referral tracking records, supervision reports",
            baseline: "0",
            targets: ["0", "114", "114", "114"],
            totalTarget: "114",
            disaggregation: ["State", "LGA", "Council Ward"],
          },
        ],
        activities: [
          { code: "PSO01R01A01", title: "Stakeholders entry & planning meetings (2 states)", indicator: "Number of stakeholders engaged", mov: "Attendance records, Meeting minutes", targets: ["1", "0", "0", "0"], totalTarget: "1" },
          { code: "PSO01R01A02", title: "Advocacy for Eye Health Committee reconstitution in Kano State", indicator: "Number of stakeholders engaged", mov: "Attendance records, Meeting minutes", targets: ["1", "1", "1", "0"], totalTarget: "3" },
          { code: "PSO01R01A03", title: "Six-monthly meetings of Integrated Health Steering Committee", indicator: "Number of stakeholders engaged", mov: "Attendance records/Reports/Minutes", targets: ["0", "2", "2", "1"], totalTarget: "5" },
          { code: "PSO01R01A04", title: "Rapid Assessment of Avoidable Blindness (RAAB) in Kano State", indicator: "Baseline prevalence of vision impairments documented", mov: "RAAB Report", targets: ["1", "0", "0", "0"], totalTarget: "1" },
          { code: "PSO01R01A05", title: "Six-monthly coordination meetings with the One-Health platform", indicator: "Number of integrated health system coordination meetings attended", mov: "Attendance records, Meeting minutes", targets: ["0", "2", "2", "0"], totalTarget: "4" },
          { code: "PSO01R01A06", title: "National Eye Health Technical Advisory input", indicator: "Number of technical inputs provided", mov: "Eye Health Technical review reports", targets: ["0", "2", "2", "0"], totalTarget: "4" },
          { code: "PSO01R01A07", title: "State Technical Programme Consultant (Kano and Jigawa)", indicator: "Number of technical consultations provided", mov: "Technical consultation reports", targets: ["0", "4", "4", "2"], totalTarget: "10" },
          { code: "PSO01R01A08", title: "Advocacy for domestication of the National Disability Act", indicator: "Number of OPD-led advocacy engagements", mov: "Attendance records, Meeting minutes", targets: ["0", "0", "4", "0"], totalTarget: "4" },
        ],
      },
      {
        key: "so1-r2",
        title: "Result 2 — Improved accessibility and workforce capacity for integrated service delivery",
        indicators: [
          {
            code: "SO1.R2.1",
            title: "Number of facilities supported to improve accessibility standards",
            mov: "Accessibility audit reports, supervision reports",
            baseline: "1 (ECWA Eye Hospital)",
            targets: ["1", "2", "3", "4"],
            totalTarget: "4",
            disaggregation: ["State", "LGA", "Council Ward", "Health facility level"],
          },
          {
            code: "SO1.R2.2",
            title: "Number of supported facilities meeting agreed service quality standards",
            mov: "Facility assessment reports, Quality assurance checklists",
            baseline: "1 (ECWA Eye Hospital)",
            targets: ["1", "21", "51", "41"],
            totalTarget: "114",
            disaggregation: ["State", "LGA", "Council Ward", "Health facility level"],
          },
          {
            code: "SO1.R2.3",
            title: "Number of health workers certified and demonstrating competence in integrated service delivery",
            mov: "Training records, competency assessments, supervision reports",
            baseline: "0",
            targets: ["0", "240", "240", null],
            totalTarget: "240",
            disaggregation: ["Gender", "Impairment / Disability type", "Cadre"],
          },
        ],
        activities: [
          { code: "PSO01R02A01", title: "Health facility capacity needs assessments, accessibility audits and referral pathway mapping", indicator: "Number of health facilities assessed", mov: "Accessibility Audit Reports", targets: ["0", "16", "16", "0"], totalTarget: "32" },
          { code: "PSO01R02A02", title: "Development of training materials and tools for integrated health services delivery", indicator: "Number of integrated training materials and tools developed, printed and distributed", mov: "Materials production and distribution logs", targets: ["50", "0", "0", "0"], totalTarget: "50" },
          { code: "PSO01R02A03", title: "Training of Trainers on integrated health services delivery (15 persons; 5 days)", indicator: "Change in participant knowledge", mov: "Pre- and post-test assessments, Training report", targets: ["15", "0", "0", "0"], totalTarget: "15" },
          { code: "PSO01R02A04", title: "Training of 20 eye care nurses and 10 General Practitioners on Primary Eye Care, PFA and QualityRights", indicator: "Change in participant knowledge", mov: "Pre- and post-test assessments", targets: ["0", "30", "0", "0"], totalTarget: "30" },
          { code: "PSO01R02A05", title: "Training of 110 primary healthcare workers in safer and inclusive Primary Eye Care", indicator: "Change in participant knowledge", mov: "Pre- and post-test assessments", targets: ["0", "55", "55", "0"], totalTarget: "110" },
          { code: "PSO01R02A06", title: "Training of 220 primary healthcare staff in mhGAP, PFA, QualityRights and Lymphedema Management", indicator: "Change in participant knowledge", mov: "Pre- and post-test assessments", targets: ["0", "110", "110", "0"], totalTarget: "220" },
          { code: "PSO01R02A07", title: "Training of 60 school teachers on School Eye Health and Vision Screening", indicator: "Change in participant knowledge", mov: "Pre- and post-test assessments", targets: ["0", "30", "30", "0"], totalTarget: "60" },
          { code: "PSO01R02A08", title: "Orientation of 880 Community Directed Distributors, 20 traditional healers and 100 persons affected by lymphedema", indicator: "Number of CDDs and traditional healers active in the programme", mov: "CDD database, participation and referral records", targets: ["0", "0", "1000", "0"], totalTarget: "1000" },
          { code: "PSO01R02A09", title: "Sustain advocacy for accessibility audit recommendations", indicator: "Number of health facilities with accessible features", mov: "Attendance records, Meeting minutes", targets: ["0", "1", "1", "1"], totalTarget: "3" },
        ],
      },
      {
        key: "so1-r3",
        title: "Result 3 — Improved delivery of quality integrated health services and referral systems",
        indicators: [
          {
            code: "SO1.R3.1",
            title: "Number of people screened for eye, NTD and mental health conditions",
            mov: "DHIS2, facility registers, outreach records",
            baseline: "0",
            targets: ["3020", "18240", "18540", "12969"],
            totalTarget: "52,769",
            disaggregation: ["Gender", "Age band", "Disease condition", "Impairment / Disability type"],
            autoKey: "people_screened",
          },
          {
            code: "SO1.R3.2",
            title: "Number of people treated in integrated eye, NTD and mental health services",
            mov: "Facility registers, outreach reports, DHIS2 reports",
            baseline: "0",
            targets: ["0", "1505", "1355", "1155"],
            totalTarget: "4015",
            disaggregation: ["Gender", "Age band", "Disease condition", "Impairment / Disability type", "Services"],
            autoKey: "people_treated",
          },
          {
            code: "SO1.R3.3",
            title: "Referral completion rate among identified cases",
            mov: "DHIS2 reports, referral tracking records",
            baseline: "0",
            targets: ["0", "0.3", "0.6", "0.8"],
            totalTarget: "0.8",
            disaggregation: ["Gender", "Age band", "Disease condition", "Services"],
            autoKey: "referral_completion",
            isPercent: true,
          },
        ],
        activities: [
          { code: "PSO01R03A01", title: "Procure, install and operationalize essential eye care equipment", indicator: "Number of arclight procured", mov: "Referral log book/register", targets: ["200", "0", "0", "0"], totalTarget: "200" },
          { code: "PSO01R03A02", title: "Procure essential consumables and surgical supplies for eye care", indicator: "Percentage of procurement requests fulfilled within agreed turnaround time", mov: "Procurement records / purchase orders", targets: ["0.9", "0", "0", "0"], totalTarget: "0.9", isPercent: true },
          { code: "PSO01R03A03", title: "Procure and distribute lymphedema management kits and psychotropic medicines", indicator: "Percentage of procurement requests fulfilled within agreed turnaround time", mov: "Procurement records", targets: ["0", "0.9", "0.9", "0"], totalTarget: "1.8", isPercent: true },
          { code: "PSO01R03A04", title: "Identification and referral of clients for services (hydrocele, lymphedema, mental health)", indicator: "Number of completed referrals", mov: "Follow-up visit reports; Patient records", targets: ["4", "4", "4", "2"], totalTarget: "14", autoKey: "completed_referrals" },
          { code: "PSO01R03A05", title: "Quarterly home visits to clients undergoing treatment for retinoblastoma", indicator: "Number of home visits conducted", mov: "Screening registers; Patient records", targets: ["4", "4", "4", "2"], totalTarget: "14", autoKey: "home_visits" },
          { code: "PSO01R03A06", title: "Facilitate 2,910 client follow-up visits after eye surgery", indicator: "Number of post-operative follow-up visits conducted", mov: "Transportation support records", targets: ["400", "1000", "1000", "690"], totalTarget: "3090", autoKey: "followup_visits" },
          { code: "PSO01R03A07", title: "Conduct 50,934 eye screenings (newborn, children, and adults)", indicator: "Number of screenings conducted", mov: "Screening registers; Referral forms", targets: ["3020", "17795", "17795", "12324"], totalTarget: "50934", autoKey: "eye_screenings" },
          { code: "PSO01R03A08", title: "Conduct 3,800 eye surgeries at ECWA Eye Hospital", indicator: "Number of cataract surgeries completed; other eye surgeries; non-surgical treatments; % reporting improved vision", mov: "Surgical theatre registers; Hospital records", targets: ["620", "1160", "1010", "1010"], totalTarget: "3800", autoKey: "eye_surgeries" },
          { code: "PSO01R03A09", title: "Procure and distribute 3,000 spectacles", indicator: "Number of individuals that received refraction services; spectacles distributed", mov: "Refraction registers; distribution lists", targets: ["200", "1700", "1000", "100"], totalTarget: "3000", autoKey: "spectacles_distributed" },
          { code: "PSO01R03A10", title: "Support monthly meetings of self-help groups (6 groups)", indicator: "Number of self-help group meetings held", mov: "Minutes of meeting, Project Report", targets: ["0", "8", "8", "2"], totalTarget: "18" },
          { code: "PSO01R03A11", title: "Provision of mental health and psychosocial support services at PHC level (1000 clients)", indicator: "Number of MHPSS services provided at PHC level", mov: "Follow-up visit reports; Patient records", targets: ["0", "250", "250", "100"], totalTarget: "600", autoKey: "mhpss_services" },
          { code: "PSO01R03A12", title: "Operationalize integrated morbidity management services to persons affected by NTDs", indicator: "Number of persons accessing integrated morbidity management services", mov: "Health facility services registers", targets: ["0", "345", "345", "145"], totalTarget: "835", autoKey: "morbidity_services" },
          { code: "PSO01R03A13", title: "Integrated quarterly clinic support supervision & service quality monitoring", indicator: "Number of monitoring and support supervision visits conducted", mov: "Supervision Visit Register", targets: ["0", "4", "4", "2"], totalTarget: "10" },
          { code: "PSO01R03A14", title: "Advocacy and SBCC/IEC materials design workshops", indicator: "Number of SBCC and advocacy approaches adopted", mov: "Attendance sheet/Reports", targets: ["0", "5", "5", "0"], totalTarget: "10" },
          { code: "PSO01R03A16", title: "Campaigns to mark health commemorative events", indicator: "Number of persons reached through campaigns/advocacy materials", mov: "Media/narrative Reports", targets: ["0", "4", "4", "0"], totalTarget: "8" },
          { code: "PSO01R03A17", title: "Six-monthly town hall and dialogue meetings in 16 communities", indicator: "Number of persons reached through town hall meetings", mov: "Attendance sheet/Reports", targets: ["0", "2", "2", "0"], totalTarget: "4" },
        ],
      },
      {
        key: "so1-r4",
        title: "Result 4 — Increased access to disability-inclusive WASH services and healthy environments",
        indicators: [
          {
            code: "SO1.R4.1",
            title: "Number of WASH facilities with improved accessibility standards",
            mov: "Accessibility assessments, WASH completion reports",
            baseline: "0",
            targets: ["0", "16", "16", "0"],
            totalTarget: "32",
            disaggregation: ["State", "LGA", "Council Ward", "Community"],
          },
          {
            code: "SO1.R4.2",
            title: "Number of people accessing disability-inclusive water and sanitation facilities",
            mov: "Community monitoring reports",
            baseline: "0",
            targets: ["36000", "36000", "4500", null],
            totalTarget: "76500",
            disaggregation: ["Gender", "Age band", "Impairment / Disability type"],
          },
          {
            code: "SO1.R4.3",
            title: "Number of communities achieving ODF status",
            mov: "WASH completion reports, ODF certification records",
            baseline: "0",
            targets: ["0", "0", "6", "10"],
            totalTarget: "16",
            disaggregation: ["State", "LGA", "Council Ward", "Community"],
          },
        ],
        activities: [
          { code: "PSO01R04A01", title: "Community triggering in 16 targeted communities with OPDs/RUWASA", indicator: "Number of communities triggered to attain ODF status", mov: "Project Report", targets: ["0", "8", "8", "0"], totalTarget: "16" },
          { code: "PSO01R04A02", title: "Formation and training of 720 WASHCOM members", indicator: "Number of WASHCOM and WASH club members demonstrating improved WASH management capacity", mov: "Training/Evaluation Report", targets: ["0", "240", "240", "240"], totalTarget: "720" },
          { code: "PSO01R04A03", title: "Training of 960 WASH Clubs in target schools", indicator: "Number of WASH club members demonstrating improved WASH management capacity", mov: "Training/Evaluation Report", targets: ["0", "320", "320", "320"], totalTarget: "960" },
          { code: "PSO01R04A04", title: "SBCC campaigns targeting 16 communities with key WASH messages", indicator: "Number of persons reached through the SBCC campaigns", mov: "Attendance Sheet/Media reach Report", targets: ["0", "8", "8", "0"], totalTarget: "16" },
          { code: "PSO01R04A05", title: "Advocate for inclusive WASH policies and release of WASH funds", indicator: "Number of relevant stakeholders engaged", mov: "Advocacy briefs/Commitment log", targets: ["1", "2", "2", "0"], totalTarget: "5" },
          { code: "PSO01R04A06", title: "Training of artisans", indicator: "Number of artisans trained", mov: "Training attendance sheets", targets: ["0", "8", "8", "0"], totalTarget: "16", disaggregation: ["Sex", "Age", "Disability status"] },
          { code: "PSO01R04A07", title: "Construct, rehabilitate and make accessible 32 water points and 32 sanitation facilities", indicator: "Number of WASH facilities constructed or rehabilitated", mov: "Monitoring Visit report", targets: ["0", "32", "32", "0"], totalTarget: "64" },
          { code: "PSO01R04A08", title: "Six-monthly joint monitoring and sustainability assessments of WASH infrastructure", indicator: "Number of functional WASH facilities; communities maintaining ODF status", mov: "Monitoring report", targets: ["0", "2", "2", "1"], totalTarget: "5" },
        ],
      },
    ],
  },
  {
    key: "so2",
    title: "Specific Objective 2",
    statement:
      "Improved economic resilience, livelihoods and social inclusion among persons with disabilities, persons affected by NTDs and other vulnerable households",
    tone: "teal",
    results: [
      {
        key: "so2-outcome",
        title: "Outcome indicators",
        indicators: [
          {
            code: "SO2.1",
            title: "Number of supported households reporting increased income",
            mov: "Household surveys, Livelihood monitoring records, Graduation assessments",
            baseline: "0",
            targets: ["0", "5", "12", "6"],
            totalTarget: "23",
            disaggregation: ["State", "LGA", "Community"],
          },
          {
            code: "SO2.2",
            title: "Number of participants reporting improved livelihood resilience",
            mov: "Household surveys, Livelihood monitoring records, MSC stories",
            baseline: "0",
            targets: ["0", "10", "40", "90"],
            totalTarget: "140",
            disaggregation: ["Gender", "Age band", "Impairment / Disability type"],
          },
          {
            code: "SO2.3",
            title: "Number of participants reporting improved social inclusion and participation",
            mov: "Household surveys, Participant interviews, MSC stories",
            baseline: "0",
            targets: ["0", "10", "50", "90"],
            totalTarget: "150",
            disaggregation: ["Gender", "Age band", "Impairment / Disability type"],
          },
        ],
        activities: [],
      },
      {
        key: "so2-r1",
        title: "Result 1 — Improved livelihood capacities, agency and self-reliance among programme participants",
        indicators: [
          { code: "SO2.R1.1", title: "Number of participants completing graduation pathway training", mov: "Training attendance sheets", baseline: "0", targets: ["0", "80", "80", "0"], totalTarget: "160", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
          { code: "SO2.R1.2", title: "Number of participants receiving coaching support", mov: "Coaching records", baseline: "0", targets: ["0", "80", "80", "0"], totalTarget: "160", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
          { code: "SO2.R1.3", title: "Number of participants demonstrating improved livelihood planning skills", mov: "Skills assessments, Participant database", baseline: "0", targets: ["0", "65", "70", "0"], totalTarget: "135", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
        ],
        activities: [
          { code: "PSO02R01A01", title: "Community entry, stakeholder engagement, awareness and sensitization", indicator: "Number of stakeholders reached", mov: "Attendance records, Activity report", targets: ["1", "0", "0", "0"], totalTarget: "1" },
          { code: "PSO02R01A02", title: "Mapping, verification and selection of beneficiaries under the Graduation Approach", indicator: "Number of eligible households enrolled and assessed with approved Graduation Pathway Plans", mov: "Beneficiary registration database, verification reports", targets: ["1", "0", "0", "0"], totalTarget: "1", autoKey: "livelihood_assessed" },
          { code: "PSO02R01A04", title: "Orientation sessions on the Graduation Approach, rights awareness and safeguarding", indicator: "Number of participants attending orientation sessions", mov: "Attendance records, Activity report", targets: ["0", "80", "0", "0"], totalTarget: "80" },
          { code: "PSO02R01A05", title: "Train 160 livelihood participants on life skills and social empowerment", indicator: "Number of participants completing integrated empowerment and livelihood-readiness training", mov: "Training attendance register", targets: ["0", "80", "80", "0"], totalTarget: "160" },
          { code: "PSO02R01A06", title: "Recruit and train 10 community-based livelihood coaches", indicator: "Number of livelihood coaches trained and deployed", mov: "Coach training records", targets: ["0", "10", "0", "0"], totalTarget: "10" },
        ],
      },
      {
        key: "so2-r2",
        title: "Result 2 — Increased economic participation and financial inclusion",
        indicators: [
          { code: "SO2.R2.1", title: "Number of participants engaged in productive livelihood activities", mov: "Business assessments, grant records, monitoring visits", baseline: "0", targets: ["0", "80", "20", "0"], totalTarget: "100", disaggregation: ["Gender", "Age band", "Impairment / Disability type"], autoKey: "livelihood_participants" },
          { code: "SO2.R2.2", title: "Number of participants receiving productive assets or start-up support", mov: "Asset distribution records", baseline: "0", targets: ["0", "80", "80", "0"], totalTarget: "160", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
          { code: "SO2.R2.3", title: "Number of participants using formal financial services", mov: "Financial inclusion reports, Participant progress records", baseline: "0", targets: ["0", "30", "65", "40"], totalTarget: "135", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
        ],
        activities: [
          { code: "PSO02R02A01", title: "Skills acquisition training for 160 livelihood participants", indicator: "Number of participants completing livelihood and financial inclusion training", mov: "Training attendance sheets", targets: ["0", "80", "80", "0"], totalTarget: "160" },
          { code: "PSO02R02A02", title: "Financial literacy and entrepreneurship development training", indicator: "Number of participants using business development and financial literacy skills", mov: "Attendance sheet, reports", targets: ["0", "80", "80", "0"], totalTarget: "160" },
          { code: "PSO02R02A03", title: "Time-bound monthly cash transfer to 160 participants", indicator: "Number of participants receiving cash transfer support", mov: "Cash transfer distribution lists/registers", targets: ["0", "80", "80", "0"], totalTarget: "160" },
          { code: "PSO02R02A04", title: "Quarterly enterprise coaching, mentoring and business development support", indicator: "Number of participating households receiving quarterly business coaching", mov: "Coaching session attendance sheets", targets: ["0", "192", "192", "0"], totalTarget: "384" },
          { code: "PSO02R02A05", title: "Procure and distribute productive assets, inputs and start-up grants", indicator: "Number of participants benefitting from productive assets or enterprise grants", mov: "Procurement records; distribution lists", targets: ["0", "80", "80", "0"], totalTarget: "160" },
        ],
      },
      {
        key: "so2-r3",
        title: "Result 3 — Increased access to community-based financial and market systems",
        indicators: [
          { code: "SO2.R3.1", title: "Number of participants enrolled in VSLAs or cooperatives", mov: "VSLA records, Cooperative records", baseline: "0", targets: ["0", "250", "375", "0"], totalTarget: "625", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
          { code: "SO2.R3.2", title: "Total amount saved through VSLA groups (NGN)", mov: "VSLA records", baseline: "0", targets: ["0", "10000000", "14000000", "0"], totalTarget: "24000000", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
          { code: "SO2.R3.3", title: "Number of participants linked to markets and value chains", mov: "Market linkage reports, Monitoring reports", baseline: "0", targets: ["0", "110", "123", "0"], totalTarget: "233", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
        ],
        activities: [
          { code: "PSO02R03A01", title: "Establish and strengthen VSLAs", indicator: "Number of functional VSLAs established or strengthened", mov: "VSLA registration/formation records", targets: ["0", "10", "15", "0"], totalTarget: "25" },
          { code: "PSO02R03A02", title: "Facilitate strategic linkages among participants and market actors", indicator: "Number of participants linked to markets or private-sector opportunities", mov: "Market linkage meeting minutes/reports", targets: ["0", "110", "123", "0"], totalTarget: "233" },
        ],
      },
      {
        key: "so2-r4",
        title: "Result 4 — Strengthened policy environment and social inclusion for persons with disabilities",
        indicators: [
          { code: "SO2.R4.1", title: "Number of disability-inclusive livelihood policies/programmes influenced", mov: "Policy documents, Advocacy reports", baseline: "0", targets: ["0", "1", "1", "0"], totalTarget: "2", disaggregation: ["State"] },
          { code: "SO2.R4.2", title: "Number of programme participants accessing government empowerment schemes", mov: "Government beneficiary economic empowerment records", baseline: "0", targets: ["0", "50", "100", "150"], totalTarget: "300", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
          { code: "SO2.R4.3", title: "Number of participants reporting reduced discrimination in economic participation", mov: "Participant perception surveys", baseline: "0", targets: ["0", "15", "65", "80"], totalTarget: "160", disaggregation: ["Gender", "Age band", "Impairment / Disability type"] },
        ],
        activities: [
          { code: "PSO02R04A01", title: "Advocate for disability-inclusive livelihood and social protection policies", indicator: "Number of participants enrolled in government-supported programmes", mov: "Advocacy engagement reports", targets: ["0", "4", "0", "0"], totalTarget: "4" },
          { code: "PSO02R04A02", title: "Conduct Graduation event and documentation of programme outcomes", indicator: "Number of participants enrolled in government-supported programmes", mov: "Graduation event report", targets: ["0", "0", "0", "160"], totalTarget: "160" },
          { code: "PSO02R04A03", title: "Produce documentary to showcase programme impact", indicator: "Number of learning and policy products disseminated", mov: "Final documentary file/link", targets: ["0", "1", "1", "1"], totalTarget: "3" },
          { code: "PSO02R04A04", title: "Facilitate gender analyses for socioeconomic inclusion", indicator: "Number of evidence products generated and used for decision-making", mov: "Gender analysis report/study", targets: ["1", "0", "0", "0"], totalTarget: "1" },
        ],
      },
    ],
  },
  {
    key: "so3",
    title: "Specific Objective 3",
    statement:
      "Strengthened governance, financing, accountability and sustainability systems for integrated and inclusive health service delivery",
    tone: "amber",
    results: [
      {
        key: "so3-outcome",
        title: "Outcome indicators",
        indicators: [
          {
            code: "SO3.1",
            title: "Proportionate increase of government resources allocated to integrated services",
            mov: "Approved budget documents, Annual Operational Plans, Budget performance reports",
            baseline: "To be determined during baseline financing assessment",
            targets: ["Baseline established + 1 commitment per state", "5% increase", "5% increase", "5% increase"],
            totalTarget: "At least 15% increase over baseline",
            disaggregation: ["State"],
          },
          {
            code: "SO3.2",
            title: "Number of supported facilities meeting sustainability benchmarks",
            mov: "Sustainability scorecards, Evaluation reports",
            baseline: "0",
            targets: ["0", "30", "60", "20"],
            totalTarget: "110",
            disaggregation: ["State", "LGA", "Ward"],
          },
          {
            code: "SO3.3",
            title: "Number of policies, plans or budgets supporting integrated and inclusive healthcare",
            mov: "Policy documents (Disability Law, Mental Health Law, State Eye Health Plan)",
            baseline: "0",
            targets: ["0", "2", "1", "0"],
            totalTarget: "3",
            disaggregation: ["State"],
          },
        ],
        activities: [],
      },
      {
        key: "so3-r1",
        title: "Result 1 — Strengthened disability-inclusive monitoring, accountability, learning and government ownership systems",
        indicators: [
          { code: "SO3.R1.1", title: "% of programme indicators reported accurately, completely and on time through the integrated MEAL system", mov: "DHIS2 reports, partner reports, reporting compliance tracker", baseline: "No functional integrated MEAL framework", targets: ["Yes", "Maintained", "Maintained", "Maintained"], totalTarget: "Yes", disaggregation: ["State"], isPercent: true },
          { code: "SO3.R1.2", title: "% of complaints and feedback cases resolved within agreed timelines", mov: "CCFM database, complaints registers, accountability reports", baseline: "To be determined", targets: ["15", "40", "60", "65"], totalTarget: "65", disaggregation: ["State", "LGA", "Ward", "Community"], autoKey: "ccfm_resolved_pct", isPercent: true },
          { code: "SO3.R1.3", title: "% of agreed actions from accountability and learning reviews implemented", mov: "Learning review reports, action plan trackers", baseline: "0", targets: ["0.2", "0.5", "0.8", "0.8"], totalTarget: "0.8", disaggregation: ["State", "LGA", "Ward", "Community"], isPercent: true },
          { code: "SO3.R1.4", title: "Government ownership and sustainability score achieved by supported facilities/LGAs", mov: "Sustainability assessment reports, ownership scorecards", baseline: "To be determined", targets: ["0", "0.05", "0.05", "0.05"], totalTarget: "0.15", disaggregation: ["State"] },
          { code: "SO3.R1.5", title: "Number of supported LGAs integrating programme approaches into routine planning and budgeting", mov: "Government policy documents, strategic plans, budget documents", baseline: "0", targets: ["4", "4", "8", "8"], totalTarget: "8", disaggregation: ["State", "LGA"] },
        ],
        activities: [
          { code: "PSO03R01A01", title: "Develop and roll out a programme-wide Participatory MEAL Framework", indicator: "MEAL Framework operationalized and used by all consortium partners", mov: "Approved MEAL framework, SOPs", targets: ["1", "0", "0", "0"], totalTarget: "1" },
          { code: "PSO03R01A02", title: "Configure and operationalize a digital reporting dashboard integrated with DHIS2", indicator: "Number of health facilities routinely submitting data through the integrated reporting system", mov: "Health facility reporting records, DHIS2 submission logs", targets: ["1", "1", "1", "1"], totalTarget: "4" },
          { code: "PSO03R01A03", title: "Three-day training of partners, OPDs, health facility staff and government counterparts on data use", indicator: "Number of trained personnel demonstrating correct use of reporting tools", mov: "Clinic support supervision reports", targets: ["0", "14", "0", "0"], totalTarget: "14" },
          { code: "PSO03R01A04", title: "Routine monthly and quarterly data collection, validation and reporting", indicator: "% of reported data meeting accuracy, completeness and consistency standards", mov: "Data quality assessment reports", targets: ["0", "12", "12", "0"], totalTarget: "24" },
          { code: "PSO03R01A05", title: "Quarterly programme learning and adaptive management review meetings", indicator: "Number of programme adaptations implemented based on review findings", mov: "Action trackers, Activity reports", targets: ["0", "2", "2", "1"], totalTarget: "5" },
          { code: "PSO03R01A06", title: "Annual programme review and operational planning meetings", indicator: "Number of stakeholders that attended the annual review/planning meetings", mov: "Activity reports, Attendance registers", targets: ["0", "1", "1", "1"], totalTarget: "3" },
          { code: "PSO03R01A07", title: "Establish and maintain accessible Community-based Complaints and Feedback Mechanisms (CCFMs)", indicator: "% of complaints resolved within agreed timelines", mov: "CCFM registers", targets: ["0", "0.2", "0.5", "0.8"], totalTarget: "0.8", autoKey: "ccfm_resolved_pct", isPercent: true },
          { code: "PSO03R01A08", title: "Annual Community Accountability Forums with OPDs and stakeholders", indicator: "Number of agreed actions implemented", mov: "Action trackers, Activity reports", targets: ["0", "1", "1", "1"], totalTarget: "3" },
          { code: "PSO03R01A09", title: "Government ownership and sustainability assessments", indicator: "% of supported facilities meeting sustainability benchmarks", mov: "Sustainability assessments", targets: ["0", "0", "1", "1"], totalTarget: "2", isPercent: true },
          { code: "PSO03R01A10", title: "Generate and disseminate evidence and learning products annually", indicator: "Number of learning and evidence products disseminated annually", mov: "Learning briefs, Policy briefs, MSC documentations", targets: ["0", "2", "2", "2"], totalTarget: "6" },
        ],
      },
    ],
  },
];

export interface FlatIndicator {
  code: string;
  title: string;
  mov?: string;
  baseline?: string;
  targets: (string | null)[];
  totalTarget?: string;
  disaggregation?: string[];
  autoKey?: AutoKey;
  isPercent?: boolean;
  objectiveKey: string;
  objectiveTitle: string;
  resultKey: string;
  resultTitle: string;
  kind: "outcome" | "result" | "activity";
}

export const flatIndicators = (): FlatIndicator[] => {
  const out: FlatIndicator[] = [];
  for (const obj of LOGFRAME) {
    for (const res of obj.results) {
      for (const ind of res.indicators) {
        out.push({
          ...ind,
          objectiveKey: obj.key, objectiveTitle: obj.title,
          resultKey: res.key, resultTitle: res.title,
          kind: res.key.endsWith("outcome") ? "outcome" : "result",
        });
      }
      for (const act of res.activities) {
        out.push({
          code: act.code, title: `${act.title} — ${act.indicator}`, mov: act.mov,
          targets: act.targets, totalTarget: act.totalTarget,
          disaggregation: act.disaggregation, autoKey: act.autoKey, isPercent: act.isPercent,
          objectiveKey: obj.key, objectiveTitle: obj.title,
          resultKey: res.key, resultTitle: res.title, kind: "activity",
        });
      }
    }
  }
  return out;
};

export const numericTarget = (raw?: string | null): number | null => {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
