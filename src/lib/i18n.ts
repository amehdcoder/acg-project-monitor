// Internationalization (i18n) system
// Supports: English, Hausa, Yoruba, Igbo

export type Language = "en" | "ha" | "yo" | "ig" | "id";

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  ha: "Hausa",
  yo: "Yorùbá",
  ig: "Igbo",
  id: "Idoma",
};

export const LANGUAGE_FLAGS: Record<Language, string> = {
  en: "🇬🇧",
  ha: "🇳🇬",
  yo: "🇳🇬",
  ig: "🇳🇬",
  id: "🇳🇬",
};

type TranslationKeys = {
  // Navigation
  "nav.dashboard": string;
  "nav.supervisor": string;
  "nav.forms": string;
  "nav.cases": string;
  "nav.templates": string;
  "nav.projects": string;
  "nav.analytics": string;
  "nav.integrations": string;
  "nav.users": string;
  "nav.settings": string;
  "nav.help": string;
  "nav.main_menu": string;

  // Auth
  "auth.login": string;
  "auth.signup": string;
  "auth.email": string;
  "auth.password": string;
  "auth.confirm_password": string;
  "auth.first_name": string;
  "auth.last_name": string;
  "auth.phone": string;
  "auth.forgot_password": string;
  "auth.create_account": string;
  "auth.welcome_back": string;
  "auth.or_continue_with": string;
  "auth.designation": string;
  "auth.state": string;

  // Dashboard
  "dashboard.title": string;
  "dashboard.total_forms": string;
  "dashboard.submissions": string;
  "dashboard.pending_sync": string;
  "dashboard.sync_rate": string;
  "dashboard.field_activity": string;
  "dashboard.recent_forms": string;
  "dashboard.fill_form": string;
  "dashboard.sync_data": string;

  // Supervisor
  "supervisor.title": string;
  "supervisor.subtitle": string;
  "supervisor.active_now": string;
  "supervisor.total_enumerators": string;
  "supervisor.submissions_today": string;
  "supervisor.geofence_compliance": string;
  "supervisor.active_alerts": string;
  "supervisor.enumerator_status": string;
  "supervisor.top_performers": string;
  "supervisor.needs_attention": string;
  "supervisor.refresh": string;
  "supervisor.all_clear": string;

  // Common
  "common.loading": string;
  "common.save": string;
  "common.cancel": string;
  "common.delete": string;
  "common.edit": string;
  "common.search": string;
  "common.filter": string;
  "common.export": string;
  "common.refresh": string;
  "common.back": string;
  "common.submit": string;
  "common.no_data": string;
  "common.active": string;
  "common.idle": string;
  "common.offline": string;
  "common.today": string;
  "common.sign_out": string;
  "common.profile": string;
  "common.all": string;

  // Data Quality
  "quality.title": string;
  "quality.duplicates": string;
  "quality.anomalies": string;
  "quality.validations": string;
  "quality.analyzing": string;
  "quality.no_analysis": string;
  "quality.score": string;
  "quality.recommendation": string;
  "quality.findings": string;
  "quality.no_issues": string;

  // Reports
  "reports.title": string;
  "reports.generate": string;
  "reports.schedule": string;
  "reports.daily_summary": string;
  "reports.weekly_report": string;
  "reports.export_pdf": string;
  "reports.export_excel": string;
};

const translations: Record<Language, TranslationKeys> = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.supervisor": "Supervisor",
    "nav.forms": "Forms",
    "nav.cases": "Cases",
    "nav.templates": "Form Templates",
    "nav.projects": "Projects",
    "nav.analytics": "Data & Analytics",
    "nav.integrations": "Integrations",
    "nav.users": "User Management",
    "nav.settings": "Settings",
    "nav.help": "Help & Support",
    "nav.main_menu": "Main Menu",
    "auth.login": "Login",
    "auth.signup": "Sign Up",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.confirm_password": "Confirm Password",
    "auth.first_name": "First Name",
    "auth.last_name": "Last Name",
    "auth.phone": "Phone Number",
    "auth.forgot_password": "Forgot password?",
    "auth.create_account": "Create Account",
    "auth.welcome_back": "Welcome back!",
    "auth.or_continue_with": "or continue with",
    "auth.designation": "Designation",
    "auth.state": "State",
    "dashboard.title": "Dashboard",
    "dashboard.total_forms": "Total Forms",
    "dashboard.submissions": "Submissions",
    "dashboard.pending_sync": "Pending Sync",
    "dashboard.sync_rate": "Sync Rate",
    "dashboard.field_activity": "Field Activity",
    "dashboard.recent_forms": "Recent Forms",
    "dashboard.fill_form": "Fill New Form",
    "dashboard.sync_data": "Sync Data",
    "supervisor.title": "Supervisor Dashboard",
    "supervisor.subtitle": "Real-time monitoring of field enumerator activity and performance",
    "supervisor.active_now": "Active Now",
    "supervisor.total_enumerators": "Total Enumerators",
    "supervisor.submissions_today": "Submissions Today",
    "supervisor.geofence_compliance": "Geofence Compliance",
    "supervisor.active_alerts": "Active Alerts",
    "supervisor.enumerator_status": "Enumerator Status",
    "supervisor.top_performers": "Top Performers",
    "supervisor.needs_attention": "Needs Attention",
    "supervisor.refresh": "Refresh",
    "supervisor.all_clear": "All Clear",
    "common.loading": "Loading...",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.export": "Export",
    "common.refresh": "Refresh",
    "common.back": "Back",
    "common.submit": "Submit",
    "common.no_data": "No data available",
    "common.active": "Active",
    "common.idle": "Idle",
    "common.offline": "Offline",
    "common.today": "Today",
    "common.sign_out": "Sign Out",
    "common.profile": "Profile",
    "common.all": "All",
    "quality.title": "AI Data Quality",
    "quality.duplicates": "Duplicates",
    "quality.anomalies": "Anomalies",
    "quality.validations": "Validations",
    "quality.analyzing": "AI is analyzing your data...",
    "quality.no_analysis": "No analysis run yet",
    "quality.score": "Quality Score",
    "quality.recommendation": "Recommendation",
    "quality.findings": "Findings",
    "quality.no_issues": "No issues found",
    "reports.title": "Reports",
    "reports.generate": "Generate Report",
    "reports.schedule": "Schedule Report",
    "reports.daily_summary": "Daily Summary",
    "reports.weekly_report": "Weekly Report",
    "reports.export_pdf": "Export PDF",
    "reports.export_excel": "Export Excel",
  },
  ha: {
    "nav.dashboard": "Duba Gabaɗaya",
    "nav.supervisor": "Mai Kula",
    "nav.forms": "Takardu",
    "nav.cases": "Shari'oi",
    "nav.templates": "Tsarin Takardu",
    "nav.projects": "Ayyuka",
    "nav.analytics": "Bayanai & Nazari",
    "nav.integrations": "Haɗuwa",
    "nav.users": "Gudanar da Masu Amfani",
    "nav.settings": "Saiti",
    "nav.help": "Taimako & Tallafi",
    "nav.main_menu": "Jerin Farko",
    "auth.login": "Shiga",
    "auth.signup": "Yi Rajista",
    "auth.email": "Imel",
    "auth.password": "Kalmar Sirri",
    "auth.confirm_password": "Tabbatar da Kalmar Sirri",
    "auth.first_name": "Sunan Farko",
    "auth.last_name": "Sunan Ƙarshe",
    "auth.phone": "Lambar Waya",
    "auth.forgot_password": "An manta kalmar sirri?",
    "auth.create_account": "Ƙirƙiri Asusu",
    "auth.welcome_back": "Barka da dawo!",
    "auth.or_continue_with": "ko ci gaba da",
    "auth.designation": "Matsayi",
    "auth.state": "Jiha",
    "dashboard.title": "Duba Gabaɗaya",
    "dashboard.total_forms": "Jimlar Takardu",
    "dashboard.submissions": "Ayyukan Da Aka Aika",
    "dashboard.pending_sync": "Jiran Haɗawa",
    "dashboard.sync_rate": "Yawan Haɗawa",
    "dashboard.field_activity": "Ayyukan Filin",
    "dashboard.recent_forms": "Sabbin Takardu",
    "dashboard.fill_form": "Cika Sabuwar Takarda",
    "dashboard.sync_data": "Haɗa Bayanai",
    "supervisor.title": "Duba Mai Kula",
    "supervisor.subtitle": "Saka idanu na lokaci-lokaci kan ayyukan masu tattara bayanai",
    "supervisor.active_now": "Masu Aiki Yanzu",
    "supervisor.total_enumerators": "Jimlar Masu Ƙidaya",
    "supervisor.submissions_today": "Ayyukan Yau",
    "supervisor.geofence_compliance": "Bin Iyakar Wuri",
    "supervisor.active_alerts": "Sanarwa Masu Aiki",
    "supervisor.enumerator_status": "Matsayin Masu Ƙidaya",
    "supervisor.top_performers": "Mafiya Kyau",
    "supervisor.needs_attention": "Na Buƙatar Kulawa",
    "supervisor.refresh": "Sabunta",
    "supervisor.all_clear": "Komai Lafiya",
    "common.loading": "Ana lodi...",
    "common.save": "Ajiye",
    "common.cancel": "Soke",
    "common.delete": "Share",
    "common.edit": "Gyara",
    "common.search": "Nema",
    "common.filter": "Tace",
    "common.export": "Fitar",
    "common.refresh": "Sabunta",
    "common.back": "Koma",
    "common.submit": "Aika",
    "common.no_data": "Babu bayanai",
    "common.active": "Mai Aiki",
    "common.idle": "Yana Jira",
    "common.offline": "Babu Layi",
    "common.today": "Yau",
    "common.sign_out": "Fita",
    "common.profile": "Bayanan Kai",
    "common.all": "Duka",
    "quality.title": "Ingancin Bayanai na AI",
    "quality.duplicates": "Kwafi",
    "quality.anomalies": "Abubuwan Ban Mamaki",
    "quality.validations": "Tabbatarwa",
    "quality.analyzing": "AI yana nazarin bayanan ku...",
    "quality.no_analysis": "Ba a gudanar da nazari ba tukuna",
    "quality.score": "Maki Inganci",
    "quality.recommendation": "Shawarwari",
    "quality.findings": "Bincike",
    "quality.no_issues": "Ba a sami matsala ba",
    "reports.title": "Rahotanni",
    "reports.generate": "Samar da Rahoto",
    "reports.schedule": "Tsara Rahoto",
    "reports.daily_summary": "Taƙaitaccen Yau",
    "reports.weekly_report": "Rahoton Mako",
    "reports.export_pdf": "Fitar da PDF",
    "reports.export_excel": "Fitar da Excel",
  },
  yo: {
    "nav.dashboard": "Pánẹ́ẹ̀lì",
    "nav.supervisor": "Alábòójútó",
    "nav.forms": "Àwọn Fọ́ọ̀mù",
    "nav.cases": "Àwọn Ọ̀ràn",
    "nav.templates": "Àwòṣe Fọ́ọ̀mù",
    "nav.projects": "Àwọn Iṣẹ́",
    "nav.analytics": "Dátà & Ìtúpalẹ̀",
    "nav.integrations": "Àsopọ̀",
    "nav.users": "Ìṣàkóso Olùmúlò",
    "nav.settings": "Ètò",
    "nav.help": "Ìrànwọ́ & Àtìlẹ́yìn",
    "nav.main_menu": "Àkójọ Àkọ́kọ́",
    "auth.login": "Wọlé",
    "auth.signup": "Forúkọsílẹ̀",
    "auth.email": "Ímeèlì",
    "auth.password": "Ọ̀rọ̀ Aṣínà",
    "auth.confirm_password": "Jẹ́rìísí Ọ̀rọ̀ Aṣínà",
    "auth.first_name": "Orúkọ Àkọ́kọ́",
    "auth.last_name": "Orúkọ Ìdílé",
    "auth.phone": "Nọ́mbà Fóònù",
    "auth.forgot_password": "Gbàgbé ọ̀rọ̀ aṣínà?",
    "auth.create_account": "Ṣí Àkáǹtì",
    "auth.welcome_back": "Ẹ kú àbọ̀!",
    "auth.or_continue_with": "tàbí tẹ̀síwájú pẹ̀lú",
    "auth.designation": "Ipò",
    "auth.state": "Ìpínlẹ̀",
    "dashboard.title": "Pánẹ́ẹ̀lì",
    "dashboard.total_forms": "Àpapọ̀ Fọ́ọ̀mù",
    "dashboard.submissions": "Àwọn Ìfìránṣẹ́",
    "dashboard.pending_sync": "Ń dúró de Ìsopọ̀",
    "dashboard.sync_rate": "Ìwọ̀n Ìsopọ̀",
    "dashboard.field_activity": "Ìṣe Pápá",
    "dashboard.recent_forms": "Fọ́ọ̀mù Tuntun",
    "dashboard.fill_form": "Kún Fọ́ọ̀mù Tuntun",
    "dashboard.sync_data": "Sopọ̀ Dátà",
    "supervisor.title": "Pánẹ́ẹ̀lì Alábòójútó",
    "supervisor.subtitle": "Àbójútó àkókò gidi lórí iṣẹ́ àwọn olùkówó dátà",
    "supervisor.active_now": "Ṣiṣẹ́ Báyìí",
    "supervisor.total_enumerators": "Àpapọ̀ Olùkówó",
    "supervisor.submissions_today": "Ìfìránṣẹ́ Lónìí",
    "supervisor.geofence_compliance": "Ìfaramọ́ Àgbègbè",
    "supervisor.active_alerts": "Ìkìlọ̀ Ṣiṣẹ́",
    "supervisor.enumerator_status": "Ipò Olùkówó",
    "supervisor.top_performers": "Àwọn Tó Dára Jù",
    "supervisor.needs_attention": "Ó Nílò Àkíyèsí",
    "supervisor.refresh": "Ṣe Tuntun",
    "supervisor.all_clear": "Gbogbo Rẹ̀ Dára",
    "common.loading": "Ń gbé kalẹ̀...",
    "common.save": "Fi Pamọ́",
    "common.cancel": "Fagilé",
    "common.delete": "Pa Rẹ́",
    "common.edit": "Ṣàtúnṣe",
    "common.search": "Wá",
    "common.filter": "Ṣàyọ",
    "common.export": "Gbé Jáde",
    "common.refresh": "Ṣe Tuntun",
    "common.back": "Padà",
    "common.submit": "Fi Ránṣẹ́",
    "common.no_data": "Kò sí dátà",
    "common.active": "Ṣiṣẹ́",
    "common.idle": "Ń sinmi",
    "common.offline": "Kò sí lórí ayélujára",
    "common.today": "Lónìí",
    "common.sign_out": "Jáde",
    "common.profile": "Profaili",
    "common.all": "Gbogbo",
    "quality.title": "Ìdánilójú Dátà AI",
    "quality.duplicates": "Ẹ̀dà Méjì",
    "quality.anomalies": "Ohun Àjèjì",
    "quality.validations": "Ìfọwọ́sí",
    "quality.analyzing": "AI ń ṣàyẹ̀wò dátà rẹ...",
    "quality.no_analysis": "A kò tíì ṣe àyẹ̀wò",
    "quality.score": "Àmì Dídára",
    "quality.recommendation": "Ìmọ̀ràn",
    "quality.findings": "Àwọn Àwárí",
    "quality.no_issues": "A kò rí ìṣòro kankan",
    "reports.title": "Àwọn Ìròyìn",
    "reports.generate": "Ṣe Ìròyìn",
    "reports.schedule": "Ṣètò Ìròyìn",
    "reports.daily_summary": "Àkópọ̀ Ojoojúmọ́",
    "reports.weekly_report": "Ìròyìn Ọ̀sẹ̀",
    "reports.export_pdf": "Gbé PDF Jáde",
    "reports.export_excel": "Gbé Excel Jáde",
  },
  ig: {
    "nav.dashboard": "Dasbọọdụ",
    "nav.supervisor": "Onye Nlekọta",
    "nav.forms": "Fọọmụ",
    "nav.cases": "Okwu",
    "nav.templates": "Nhazi Fọọmụ",
    "nav.projects": "Ọrụ",
    "nav.analytics": "Data & Nyocha",
    "nav.integrations": "Njikọta",
    "nav.users": "Njikwa Ndị Ọrụ",
    "nav.settings": "Ntọala",
    "nav.help": "Enyemaka & Nkwado",
    "nav.main_menu": "Ndepụta Isi",
    "auth.login": "Banye",
    "auth.signup": "Debanye Aha",
    "auth.email": "Email",
    "auth.password": "Okwuntụghe",
    "auth.confirm_password": "Kwenye Okwuntụghe",
    "auth.first_name": "Aha Mbụ",
    "auth.last_name": "Aha Ezinụlọ",
    "auth.phone": "Nọmbà Ekwentị",
    "auth.forgot_password": "Chefuru okwuntụghe?",
    "auth.create_account": "Mepee Akaụntụ",
    "auth.welcome_back": "Nnọọ!",
    "auth.or_continue_with": "ma ọ bụ gaa n'ihu site na",
    "auth.designation": "Ọkwa",
    "auth.state": "Steeti",
    "dashboard.title": "Dasbọọdụ",
    "dashboard.total_forms": "Ngụkọta Fọọmụ",
    "dashboard.submissions": "Ihe E Zigara",
    "dashboard.pending_sync": "Na-eche Njikọ",
    "dashboard.sync_rate": "Ọnụọgụ Njikọ",
    "dashboard.field_activity": "Ọrụ Ubi",
    "dashboard.recent_forms": "Fọọmụ Ọhụrụ",
    "dashboard.fill_form": "Dejupụta Fọọmụ Ọhụrụ",
    "dashboard.sync_data": "Jikọta Data",
    "supervisor.title": "Dasbọọdụ Onye Nlekọta",
    "supervisor.subtitle": "Nlekọta oge nkịtị nke ọrụ ndị na-anakọta data",
    "supervisor.active_now": "Na-arụ Ọrụ Ugbu a",
    "supervisor.total_enumerators": "Ngụkọta Ndị Ọrụ",
    "supervisor.submissions_today": "Nke Taa",
    "supervisor.geofence_compliance": "Ndabere Ókè Ala",
    "supervisor.active_alerts": "Ịdọ Aka Ná Ntị",
    "supervisor.enumerator_status": "Ọnọdụ Ndị Ọrụ",
    "supervisor.top_performers": "Ndị Kachasị Mma",
    "supervisor.needs_attention": "Chọrọ Nlebara Anya",
    "supervisor.refresh": "Mee Ọhụrụ",
    "supervisor.all_clear": "Ihe Niile Dị Mma",
    "common.loading": "Na-ebu...",
    "common.save": "Chekwaa",
    "common.cancel": "Kagbuo",
    "common.delete": "Hichapụ",
    "common.edit": "Dezie",
    "common.search": "Chọọ",
    "common.filter": "Nyochaa",
    "common.export": "Bupụta",
    "common.refresh": "Mee Ọhụrụ",
    "common.back": "Laghachi",
    "common.submit": "Nyefee",
    "common.no_data": "Enweghị data",
    "common.active": "Na-arụ ọrụ",
    "common.idle": "Na-ezuike",
    "common.offline": "Na-enweghị njikọ",
    "common.today": "Taa",
    "common.sign_out": "Pụọ",
    "common.profile": "Profaịlụ",
    "common.all": "Niile",
    "quality.title": "Ịdị Mma Data AI",
    "quality.duplicates": "Ndị Okpụrụkpụ",
    "quality.anomalies": "Ihe Pụrụ Iche",
    "quality.validations": "Nyocha",
    "quality.analyzing": "AI na-enyocha data gị...",
    "quality.no_analysis": "A nabeghị nyocha ọ bụla",
    "quality.score": "Akara Ịdị Mma",
    "quality.recommendation": "Ndụmọdụ",
    "quality.findings": "Ihe A Chọpụtara",
    "quality.no_issues": "Ahụghị nsogbu ọ bụla",
    "reports.title": "Akụkọ",
    "reports.generate": "Mepụta Akụkọ",
    "reports.schedule": "Hazie Akụkọ",
    "reports.daily_summary": "Nchịkọta Ụbọchị",
    "reports.weekly_report": "Akụkọ Izu",
    "reports.export_pdf": "Bupụta PDF",
    "reports.export_excel": "Bupụta Excel",
  },
};

export function t(key: keyof TranslationKeys, lang: Language = "en"): string {
  return translations[lang]?.[key] || translations.en[key] || key;
}

export default translations;
