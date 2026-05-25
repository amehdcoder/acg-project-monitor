import { supabase } from "@/integrations/supabase/client";
import type { OfficeFormCode } from "./types";

export type ApproverRole = "hr" | "admin" | "safeguarding";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "in_progress" | "closed";

export const APPROVER_ROLE_FOR_CODE: Record<OfficeFormCode, ApproverRole> = {
  leave: "hr",
  stationery: "admin",
  srf: "safeguarding",
  incident: "safeguarding",
};

export const APPROVER_ROLE_META: Record<ApproverRole, { title: string; subtitle: string; accent: string; tintBg: string; tintFg: string; codes: OfficeFormCode[] }> = {
  hr: {
    title: "Human Resource Officer",
    subtitle: "Approves Leave Applications",
    accent: "#22A55A",
    tintBg: "bg-[#E2F5EC]",
    tintFg: "text-[#1F7A3A]",
    codes: ["leave"],
  },
  admin: {
    title: "Administration Officer",
    subtitle: "Approves Office Stationery Requests",
    accent: "#2F6FE6",
    tintBg: "bg-[#E3ECFB]",
    tintFg: "text-[#1656BA]",
    codes: ["stationery"],
  },
  safeguarding: {
    title: "Safeguarding Officer",
    subtitle: "Acts on Safeguarding Reports & Incidents",
    accent: "#7C5CFF",
    tintBg: "bg-[#EDE7FE]",
    tintFg: "text-[#5b3fbf]",
    codes: ["srf", "incident"],
  },
};

export const ANNUAL_LEAVE_DAYS = 21;

export async function getAnnualLeaveBalance(userId: string, year: number = new Date().getFullYear()) {
  const { data } = await supabase
    .from("office_form_submissions" as any)
    .select("data, approval_status")
    .eq("submitted_by", userId)
    .eq("form_code", "leave")
    .eq("approval_status", "approved");
  const used = ((data as any[]) || [])
    .filter((r) => {
      const start = r.data?.start_date;
      return start && new Date(start).getFullYear() === year && (r.data?.leave_type === "annual");
    })
    .reduce((sum, r) => sum + (Number(r.data?.total_working_days) || 0), 0);
  return { used, remaining: Math.max(0, ANNUAL_LEAVE_DAYS - used), total: ANNUAL_LEAVE_DAYS };
}

export async function fetchMyApproverRoles(userId: string): Promise<ApproverRole[]> {
  const { data } = await supabase
    .from("office_form_approvers" as any)
    .select("approver_role")
    .eq("user_id", userId);
  return ((data as any[]) || []).map((r) => r.approver_role as ApproverRole);
}
