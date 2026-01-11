import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

export interface CaseManagementSettings {
  enabled: boolean;
  action: "none" | "register" | "update" | "close";
  caseType?: string;
  caseTypeId?: string;
  caseNameQuestion?: string;
  saveToProperties: { questionId: string; propertyName: string }[];
  closeCondition?: string;
  loadFromProperties: { propertyName: string; questionId: string }[];
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

export const useCaseManagement = (
  settings: CaseManagementSettings | undefined,
  userId: string,
  projectId: string
) => {
  const [selectedCase, setSelectedCase] = useState<SelectedCase | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if case selection is required
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

  // Create a new case (for register action)
  const createCase = useCallback(
    async (
      formId: string,
      responses: Record<string, unknown>,
      submissionId: string
    ): Promise<string | null> => {
      if (!settings?.enabled || settings.action !== "register") return null;
      if (!settings.caseTypeId) {
        console.error("No case type configured");
        return null;
      }

      setLoading(true);
      try {
        // Get case name from the specified question
        let caseName = "New Case";
        if (settings.caseNameQuestion) {
          const nameValue = responses[settings.caseNameQuestion];
          if (nameValue) {
            caseName = String(nameValue);
          }
        }

        // Build properties from mappings
        const properties: Record<string, unknown> = {};
        for (const mapping of settings.saveToProperties || []) {
          if (mapping.questionId && mapping.propertyName) {
            properties[mapping.propertyName] = responses[mapping.questionId];
          }
        }

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

        // Record the activity
        await supabase.from("case_activities").insert({
          case_id: caseData.id,
          activity_type: "registration",
          performed_by: userId,
          form_submission_id: submissionId,
          notes: `Case registered via form submission`,
          changes: { action: "created", properties } as unknown as Json,
        });

        toast({
          title: "Case Created",
          description: `Case "${caseName}" has been registered.`,
        });

        return caseData.id;
      } catch (error) {
        console.error("Error creating case:", error);
        toast({
          title: "Error",
          description: "Failed to create case.",
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
      if (!selectedCase) {
        console.error("No case selected for update");
        return false;
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
        await supabase.from("case_activities").insert({
          case_id: selectedCase.id,
          activity_type: "follow_up",
          performed_by: userId,
          form_submission_id: submissionId,
          notes: `Case updated via form submission`,
          changes: { action: "updated", changes } as unknown as Json,
        });

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
    [settings, selectedCase, userId]
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
        // Simple condition parsing: #form/question_id = 'value'
        const match = settings.closeCondition.match(
          /#form\/(\w+)\s*=\s*['"](.+?)['"]/
        );
        if (match) {
          const [, questionId, expectedValue] = match;
          const actualValue = responses[questionId];
          if (String(actualValue) !== expectedValue) {
            // Condition not met, don't close
            return true;
          }
        }
      }

      setLoading(true);
      try {
        // Update properties one last time
        const currentProps = selectedCase.properties || {};
        const finalProperties: Record<string, unknown> = { ...currentProps };

        for (const mapping of settings.saveToProperties || []) {
          if (mapping.questionId && mapping.propertyName) {
            finalProperties[mapping.propertyName] = responses[mapping.questionId];
          }
        }

        // Close the case
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

        // Record the activity
        await supabase.from("case_activities").insert({
          case_id: selectedCase.id,
          activity_type: "closure",
          performed_by: userId,
          form_submission_id: submissionId,
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
        case "register":
          const caseId = await createCase(formId, responses, submissionId);
          return caseId !== null;
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
    loading,
  };
};

export default useCaseManagement;
