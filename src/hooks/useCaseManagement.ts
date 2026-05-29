import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

export type CaseManagementAction =
  | "none"
  | "register"
  | "update"
  | "close"
  | "referral"
  | "case_note"
  | "follow_up";

export interface CaseManagementSettings {
  enabled: boolean;
  action: CaseManagementAction;
  caseType?: string;
  caseTypeId?: string;
  caseNameQuestion?: string;
  saveToProperties: { questionId: string; propertyName: string }[];
  closeCondition?: string;
  loadFromProperties: { propertyName: string; questionId: string }[];
  // Referral behavior mappings
  referralMapping?: {
    typeQuestion?: string;
    destinationQuestion?: string;
    reasonQuestion?: string;
    priorityQuestion?: string;
  };
  // Case note behavior
  noteQuestion?: string;
  // Follow-up task behavior
  followUpMapping?: {
    titleQuestion?: string;
    descriptionQuestion?: string;
    dueDateQuestion?: string;
  };
}

export interface SelectedCase {
  id: string;
  name: string;
  properties: Record<string, unknown>;
}

// Helper to safely parse JSON properties
const parseProperties = (props: Json | null): Record<string, unknown> => {
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return {};
  }
  return props as Record<string, unknown>;
};

// Build properties from save mappings
const buildProperties = (
  settings: CaseManagementSettings,
  responses: Record<string, unknown>
): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  for (const mapping of settings.saveToProperties || []) {
    if (mapping.questionId && mapping.propertyName) {
      properties[mapping.propertyName] = responses[mapping.questionId];
    }
  }
  return properties;
};

// Get case name from responses
const getCaseName = (
  settings: CaseManagementSettings,
  responses: Record<string, unknown>
): string => {
  if (settings.caseNameQuestion) {
    const nameValue = responses[settings.caseNameQuestion];
    if (nameValue) return String(nameValue);
  }
  return "New Case";
};

// Compute and set next_follow_up_date for a case based on its case type schedule
const computeNextFollowUp = async (caseId: string, caseTypeId: string) => {
  try {
    const { data: ct } = await supabase
      .from("case_types")
      .select("follow_up_schedule")
      .eq("id", caseTypeId)
      .maybeSingle();

    const schedule = ct?.follow_up_schedule as { enabled?: boolean; frequency?: string; intervalDays?: number } | null;
    if (!schedule?.enabled) return;

    const FREQ_DAYS: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 };
    const interval = schedule.frequency === "custom" ? (schedule.intervalDays || 7) : (FREQ_DAYS[schedule.frequency || "weekly"] || 7);

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    await supabase
      .from("cases")
      .update({ next_follow_up_date: nextDate.toISOString() })
      .eq("id", caseId);
  } catch (e) {
    console.error("Error computing next follow-up date:", e);
  }
};

export const useCaseManagement = (
  settings: CaseManagementSettings | undefined,
  userId: string,
  projectId: string
) => {
  const [selectedCase, setSelectedCase] = useState<SelectedCase | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if case selection is required (but not mandatory — auto-register fallback exists)
  const requiresCaseSelection =
    settings?.enabled &&
    (settings.action === "update" || settings.action === "close");

  // Pre-populate form responses from case properties
  const getPrePopulatedResponses = useCallback((): Record<string, unknown> => {
    if (!selectedCase || !settings?.loadFromProperties?.length) {
      return {};
    }

    const responses: Record<string, unknown> = {};
    for (const mapping of settings.loadFromProperties) {
      if (mapping.propertyName && mapping.questionId) {
        const value = selectedCase.properties[mapping.propertyName];
        if (value !== undefined) {
          responses[mapping.questionId] = value;
        }
      }
    }
    return responses;
  }, [selectedCase, settings?.loadFromProperties]);

  // Create a new case (register action or auto-register fallback)
  const createCase = useCallback(
    async (
      formId: string,
      responses: Record<string, unknown>,
      submissionId: string,
      activityType: string = "registration"
    ): Promise<string | null> => {
      if (!settings?.enabled) return null;
      if (!settings.caseTypeId) {
        console.error("No case type configured for case registration");
        toast({
          title: "Configuration Error",
          description: "No case type is configured. Please set a case type in the form's case management settings.",
          variant: "destructive",
        });
        return null;
      }

      setLoading(true);
      try {
        const caseName = getCaseName(settings, responses);
        const properties = buildProperties(settings, responses);

        // Create the case
        const { data: caseData, error: caseError } = await supabase
          .from("cases")
          .insert({
            project_id: projectId,
            case_type_id: settings.caseTypeId,
            name: caseName,
            owner_id: userId,
            opened_by: userId,
            last_modified_by: userId,
            properties: properties as unknown as Json,
            status: "open",
          })
          .select()
          .single();

        if (caseError) throw caseError;

        // Record the activity (don't let FK failure block the case creation)
        let formSubId: string | undefined;
        try {
          const { data: subExists } = await supabase
            .from("form_submissions")
            .select("id")
            .eq("id", submissionId)
            .maybeSingle();
          if (subExists) formSubId = submissionId;
        } catch {
          // Ignore — just don't set the FK
        }

        await supabase.from("case_activities").insert({
          case_id: caseData.id,
          activity_type: activityType,
          performed_by: userId,
          form_submission_id: formSubId || null,
          notes: `Case ${activityType === "registration" ? "registered" : "auto-registered"} via form submission`,
          changes: { action: "created", properties } as unknown as Json,
        });

        // Compute next_follow_up_date from case type schedule
        await computeNextFollowUp(caseData.id, settings.caseTypeId!);

        toast({
          title: "Case Created",
          description: `Case "${caseName}" has been registered successfully.`,
        });

        return caseData.id;
      } catch (error) {
        console.error("Error creating case:", error);
        toast({
          title: "Error",
          description: "Failed to create case. Please check your permissions and try again.",
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [settings, userId, projectId]
  );

  // Update an existing case (for update action)
  const updateCase = useCallback(
    async (
      formId: string,
      responses: Record<string, unknown>,
      submissionId: string
    ): Promise<boolean> => {
      if (!settings?.enabled || settings.action !== "update") return true;

      // AUTO-REGISTER FALLBACK: If no case is selected, create a new one instead
      if (!selectedCase) {
        console.log("No case selected for update — auto-registering a new case");
        const caseId = await createCase(formId, responses, submissionId, "registration");
        return caseId !== null;
      }

      setLoading(true);
      try {
        // Build updated properties
        const currentProps = selectedCase.properties || {};
        const updatedProperties: Record<string, unknown> = { ...currentProps };
        const changes: Record<string, { old: unknown; new: unknown }> = {};

        for (const mapping of settings.saveToProperties || []) {
          if (mapping.questionId && mapping.propertyName) {
            const newValue = responses[mapping.questionId];
            const oldValue = currentProps[mapping.propertyName];
            if (newValue !== oldValue) {
              changes[mapping.propertyName] = { old: oldValue, new: newValue };
              updatedProperties[mapping.propertyName] = newValue;
            }
          }
        }

        // Update the case
        const { error: updateError } = await supabase
          .from("cases")
          .update({
            properties: updatedProperties as unknown as Json,
            last_modified_by: userId,
            last_modified_at: new Date().toISOString(),
          })
          .eq("id", selectedCase.id);

        if (updateError) throw updateError;

        // Record the activity
        let formSubId: string | undefined;
        try {
          const { data: subExists } = await supabase
            .from("form_submissions")
            .select("id")
            .eq("id", submissionId)
            .maybeSingle();
          if (subExists) formSubId = submissionId;
        } catch {
          // Ignore
        }

        await supabase.from("case_activities").insert({
          case_id: selectedCase.id,
          activity_type: "follow_up",
          performed_by: userId,
          form_submission_id: formSubId || null,
          notes: `Case updated via form submission`,
          changes: { action: "updated", changes } as unknown as Json,
        });

        // Recompute next follow-up date
        await computeNextFollowUp(selectedCase.id, settings.caseTypeId!);

        toast({
          title: "Case Updated",
          description: `Case "${selectedCase.name}" has been updated.`,
        });

        return true;
      } catch (error) {
        console.error("Error updating case:", error);
        toast({
          title: "Error",
          description: "Failed to update case.",
          variant: "destructive",
        });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [settings, selectedCase, userId, createCase]
  );

  // Close a case (for close action)
  const closeCase = useCallback(
    async (
      formId: string,
      responses: Record<string, unknown>,
      submissionId: string
    ): Promise<boolean> => {
      if (!settings?.enabled || settings.action !== "close") return true;
      if (!selectedCase) {
        console.error("No case selected to close");
        return false;
      }

      // Check close condition if specified
      if (settings.closeCondition) {
        const match = settings.closeCondition.match(
          /#form\/(\w+)\s*=\s*['"](.+?)['"]/
        );
        if (match) {
          const [, questionId, expectedValue] = match;
          const actualValue = responses[questionId];
          if (String(actualValue) !== expectedValue) {
            return true; // Condition not met, don't close
          }
        }
      }

      setLoading(true);
      try {
        const currentProps = selectedCase.properties || {};
        const finalProperties: Record<string, unknown> = { ...currentProps };

        for (const mapping of settings.saveToProperties || []) {
          if (mapping.questionId && mapping.propertyName) {
            finalProperties[mapping.propertyName] = responses[mapping.questionId];
          }
        }

        const { error: closeError } = await supabase
          .from("cases")
          .update({
            properties: finalProperties as unknown as Json,
            status: "closed",
            closed_at: new Date().toISOString(),
            closed_by: userId,
            last_modified_by: userId,
            last_modified_at: new Date().toISOString(),
          })
          .eq("id", selectedCase.id);

        if (closeError) throw closeError;

        let formSubId: string | undefined;
        try {
          const { data: subExists } = await supabase
            .from("form_submissions")
            .select("id")
            .eq("id", submissionId)
            .maybeSingle();
          if (subExists) formSubId = submissionId;
        } catch {
          // Ignore
        }

        await supabase.from("case_activities").insert({
          case_id: selectedCase.id,
          activity_type: "closure",
          performed_by: userId,
          form_submission_id: formSubId || null,
          notes: `Case closed via form submission`,
          changes: { action: "closed" } as unknown as Json,
        });

        toast({
          title: "Case Closed",
          description: `Case "${selectedCase.name}" has been closed.`,
        });

        return true;
      } catch (error) {
        console.error("Error closing case:", error);
        toast({
          title: "Error",
          description: "Failed to close case.",
          variant: "destructive",
        });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [settings, selectedCase, userId]
  );

  // Process case action after form submission
  const processCaseAction = useCallback(
    async (
      formId: string,
      responses: Record<string, unknown>,
      submissionId: string
    ): Promise<boolean> => {
      if (!settings?.enabled) return true;

      switch (settings.action) {
        case "register": {
          const caseId = await createCase(formId, responses, submissionId);
          return caseId !== null;
        }
        case "update":
          return await updateCase(formId, responses, submissionId);
        case "close":
          return await closeCase(formId, responses, submissionId);
        default:
          return true;
      }
    },
    [settings, createCase, updateCase, closeCase]
  );

  return {
    selectedCase,
    setSelectedCase,
    requiresCaseSelection,
    getPrePopulatedResponses,
    processCaseAction,
    createCase,
    loading,
  };
};

export default useCaseManagement;
