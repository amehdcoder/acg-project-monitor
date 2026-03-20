import { useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FormTrackingOptions {
  formId: string;
  userId: string;
}

export const useFormTracking = ({ formId, userId }: FormTrackingOptions) => {
  const formOpenedAt = useRef<number>(Date.now());
  const questionTimestamps = useRef<Record<string, number>>({});
  const validationFailures = useRef<Array<{ questionId: string; questionLabel: string; rule: string; value: string; timestamp: string }>>([]);
  const skippedQuestions = useRef<Set<string>>(new Set());
  const previouslyVisible = useRef<Set<string>>(new Set());

  // Reset timer when form opens
  useEffect(() => {
    formOpenedAt.current = Date.now();
  }, [formId]);

  // Track when a question is answered (for timing)
  const trackQuestionAnswer = useCallback((questionId: string) => {
    if (!questionTimestamps.current[questionId]) {
      questionTimestamps.current[questionId] = Date.now();
    }
  }, []);

  // Track validation failure
  const trackValidationFailure = useCallback((questionId: string, questionLabel: string, rule: string, attemptedValue: string) => {
    validationFailures.current.push({
      questionId,
      questionLabel,
      rule,
      value: typeof attemptedValue === "string" ? attemptedValue.slice(0, 200) : String(attemptedValue).slice(0, 200),
      timestamp: new Date().toISOString(),
    });

    // Also log to surveillance
    supabase.from("admin_surveillance_log" as any).insert({
      actor_id: userId,
      actor_email: "",
      actor_role: "user",
      action_type: "validation_failure",
      action_description: `Validation failed for "${questionLabel}": ${rule}`,
      target_entity: "form",
      target_id: formId,
      user_agent: navigator.userAgent,
      metadata: { questionId, rule, form_id: formId },
    }).then(() => {});
  }, [formId, userId]);

  // Track visible questions to detect skipped ones
  const updateVisibleQuestions = useCallback((visibleIds: string[], responses: Record<string, any>) => {
    const currentVisible = new Set(visibleIds);
    
    // Questions that were visible but have no response are "skipped"
    for (const qId of currentVisible) {
      previouslyVisible.current.add(qId);
    }

    // Update skipped set
    skippedQuestions.current.clear();
    for (const qId of previouslyVisible.current) {
      if (currentVisible.has(qId) && (responses[qId] === undefined || responses[qId] === null || responses[qId] === "")) {
        skippedQuestions.current.add(qId);
      }
    }
  }, []);

  // Save all tracking data on submission
  const saveTrackingData = useCallback(async (submissionId: string, responses: Record<string, any>, visibleQuestionLabels: Record<string, string>) => {
    const completionTimeSeconds = Math.round((Date.now() - formOpenedAt.current) / 1000);

    const events: any[] = [];

    // Form timing event
    events.push({
      form_id: formId,
      submission_id: submissionId,
      user_id: userId,
      event_type: "form_timing",
      event_data: {
        completion_time_seconds: completionTimeSeconds,
        opened_at: new Date(formOpenedAt.current).toISOString(),
        submitted_at: new Date().toISOString(),
        question_count: Object.keys(visibleQuestionLabels).length,
        answered_count: Object.keys(responses).filter(k => responses[k] !== undefined && responses[k] !== null && responses[k] !== "").length,
      },
    });

    // Validation failures
    if (validationFailures.current.length > 0) {
      events.push({
        form_id: formId,
        submission_id: submissionId,
        user_id: userId,
        event_type: "validation_failure",
        event_data: {
          failures: validationFailures.current,
          total_failures: validationFailures.current.length,
        },
      });
    }

    // Skipped questions
    const skippedList = Array.from(skippedQuestions.current).map(qId => ({
      questionId: qId,
      label: visibleQuestionLabels[qId] || qId,
    }));
    if (skippedList.length > 0) {
      events.push({
        form_id: formId,
        submission_id: submissionId,
        user_id: userId,
        event_type: "question_skipped",
        event_data: {
          skipped_questions: skippedList,
          total_skipped: skippedList.length,
        },
      });
    }

    // Flag rushed submissions (< 60 seconds)
    if (completionTimeSeconds < 60) {
      // Log to surveillance as suspicious
      await supabase.from("admin_surveillance_log" as any).insert({
        actor_id: userId,
        actor_email: "",
        actor_role: "user",
        action_type: "rushed_submission",
        action_description: `Form "${formId}" completed in ${completionTimeSeconds}s (possible fake data)`,
        target_entity: "form_submission",
        target_id: submissionId,
        user_agent: navigator.userAgent,
        metadata: { completion_time_seconds: completionTimeSeconds, form_id: formId },
      });
    }

    if (events.length > 0) {
      await supabase.from("form_tracking_events" as any).insert(events);
    }

    // Reset for next form
    validationFailures.current = [];
    skippedQuestions.current.clear();
    previouslyVisible.current.clear();
  }, [formId, userId]);

  return {
    trackQuestionAnswer,
    trackValidationFailure,
    updateVisibleQuestions,
    saveTrackingData,
    formOpenedAt,
  };
};
