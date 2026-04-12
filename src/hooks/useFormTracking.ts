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
  const userProfileRef = useRef<{ email: string; name: string; state: string; lga: string } | null>(null);
  const formNameRef = useRef<string>("");

  // Fetch user profile & form name once for enrichment
  useEffect(() => {
    formOpenedAt.current = Date.now();

    const fetchContext = async () => {
      const [profileRes, formRes] = await Promise.all([
        supabase.from("profiles").select("email, first_name, last_name, state, lga").eq("user_id", userId).maybeSingle(),
        supabase.from("forms").select("name").eq("id", formId).maybeSingle(),
      ]);
      if (profileRes.data) {
        const p = profileRes.data;
        userProfileRef.current = {
          email: p.email || "",
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
          state: p.state || "",
          lga: p.lga || "",
        };
      }
      if (formRes.data) {
        formNameRef.current = formRes.data.name || "";
      }
    };
    fetchContext();
  }, [formId, userId]);

  const trackQuestionAnswer = useCallback((questionId: string) => {
    if (!questionTimestamps.current[questionId]) {
      questionTimestamps.current[questionId] = Date.now();
    }
  }, []);

  const trackValidationFailure = useCallback((questionId: string, questionLabel: string, rule: string, attemptedValue: string) => {
    validationFailures.current.push({
      questionId,
      questionLabel,
      rule,
      value: typeof attemptedValue === "string" ? attemptedValue.slice(0, 200) : String(attemptedValue).slice(0, 200),
      timestamp: new Date().toISOString(),
    });

    const profile = userProfileRef.current;
    const formName = formNameRef.current;

    // Log to surveillance with user & form details
    supabase.from("admin_surveillance_log" as any).insert({
      actor_id: userId,
      actor_email: profile?.email || "",
      actor_role: "user",
      action_type: "validation_failure",
      action_description: `Validation failed for "${questionLabel}": ${rule} | Form: "${formName}" | User: ${profile?.name || "Unknown"}${profile?.state ? ` (${profile.state}${profile.lga ? `, ${profile.lga}` : ""})` : ""}`,
      target_entity: "form",
      target_id: formId,
      user_agent: navigator.userAgent,
      metadata: {
        questionId,
        questionLabel,
        rule,
        attempted_value: typeof attemptedValue === "string" ? attemptedValue.slice(0, 100) : String(attemptedValue).slice(0, 100),
        form_id: formId,
        form_name: formName,
        user_name: profile?.name || "",
        user_email: profile?.email || "",
        user_state: profile?.state || "",
        user_lga: profile?.lga || "",
      },
    }).then(() => {});
  }, [formId, userId]);

  const updateVisibleQuestions = useCallback((visibleIds: string[], responses: Record<string, any>) => {
    const currentVisible = new Set(visibleIds);
    
    for (const qId of currentVisible) {
      previouslyVisible.current.add(qId);
    }

    skippedQuestions.current.clear();
    for (const qId of previouslyVisible.current) {
      if (currentVisible.has(qId) && (responses[qId] === undefined || responses[qId] === null || responses[qId] === "")) {
        skippedQuestions.current.add(qId);
      }
    }
  }, []);

  const saveTrackingData = useCallback(async (submissionId: string, responses: Record<string, any>, visibleQuestionLabels: Record<string, string>) => {
    const completionTimeSeconds = Math.round((Date.now() - formOpenedAt.current) / 1000);
    const profile = userProfileRef.current;
    const formName = formNameRef.current;

    const userMeta = {
      user_name: profile?.name || "",
      user_email: profile?.email || "",
      user_state: profile?.state || "",
      user_lga: profile?.lga || "",
      form_name: formName,
    };

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
        ...userMeta,
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
          ...userMeta,
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
          ...userMeta,
        },
      });

      // Also log to surveillance for realtime visibility
      await supabase.from("admin_surveillance_log" as any).insert({
        actor_id: userId,
        actor_email: profile?.email || "",
        actor_role: "user",
        action_type: "skipped_questions",
        action_description: `Skipped ${skippedList.length} question(s) in "${formName}" | User: ${profile?.name || "Unknown"}${profile?.state ? ` (${profile.state})` : ""} | Questions: ${skippedList.slice(0, 3).map(q => q.label).join(", ")}${skippedList.length > 3 ? ` +${skippedList.length - 3} more` : ""}`,
        target_entity: "form_submission",
        target_id: submissionId,
        user_agent: navigator.userAgent,
        metadata: {
          form_id: formId,
          ...userMeta,
          skipped_questions: skippedList,
          total_skipped: skippedList.length,
        },
      });
    }

    // Flag rushed submissions (< 60 seconds)
    if (completionTimeSeconds < 60) {
      await supabase.from("admin_surveillance_log" as any).insert({
        actor_id: userId,
        actor_email: profile?.email || "",
        actor_role: "user",
        action_type: "rushed_submission",
        action_description: `Form "${formName}" completed in ${completionTimeSeconds}s (possible fake data) | User: ${profile?.name || "Unknown"}${profile?.state ? ` (${profile.state}${profile.lga ? `, ${profile.lga}` : ""})` : ""} | ${Object.keys(responses).filter(k => responses[k] !== undefined && responses[k] !== null && responses[k] !== "").length}/${Object.keys(visibleQuestionLabels).length} questions answered`,
        target_entity: "form_submission",
        target_id: submissionId,
        user_agent: navigator.userAgent,
        metadata: {
          completion_time_seconds: completionTimeSeconds,
          form_id: formId,
          ...userMeta,
          answered: Object.keys(responses).filter(k => responses[k] !== undefined && responses[k] !== null && responses[k] !== "").length,
          total_questions: Object.keys(visibleQuestionLabels).length,
        },
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
