export type OfficeFormCode = "srf" | "incident" | "leave" | "stationery";

export interface OfficeFormMeta {
  code: OfficeFormCode;
  title: string;
  subtitle: string;
  accent: string;     // brand color hex
  tintBg: string;     // soft tint
  tintFg: string;
  icon: string;       // lucide icon name
  badge: string;
}

export const OFFICE_FORMS: OfficeFormMeta[] = [
  { code: "srf", title: "Safeguarding Reporting Form (SRF)", subtitle: "Share a concern. Confidential & safe to use.", accent: "#7C5CFF", tintBg: "bg-[#EDE7FE]", tintFg: "text-[#7C5CFF]", icon: "ShieldCheck", badge: "Confidential" },
  { code: "incident", title: "Safeguarding Incident Form", subtitle: "Report, manage and follow up safeguarding incidents.", accent: "#E25555", tintBg: "bg-[#FCE9E9]", tintFg: "text-[#E25555]", icon: "AlertTriangle", badge: "Secure" },
  { code: "leave", title: "Leave Application Form", subtitle: "Request leave from your supervisor.", accent: "#22A55A", tintBg: "bg-[#E2F5EC]", tintFg: "text-[#22A55A]", icon: "CalendarDays", badge: "HR" },
  { code: "stationery", title: "Office Stationery Request Form", subtitle: "Request office supplies and stationery items.", accent: "#2F6FE6", tintBg: "bg-[#E3ECFB]", tintFg: "text-[#2F6FE6]", icon: "Package", badge: "Admin" },
];
