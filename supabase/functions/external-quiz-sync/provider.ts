export interface GoogleItem {
  title?: string;
  questionItem?: { question?: { questionId?: string; choiceQuestion?: { type?: string; options?: { value: string }[] }; grading?: { pointValue?: number; correctAnswers?: { answers?: { value: string }[] } } } };
}
export interface GoogleForm { formId: string; info?: { title?: string }; items?: GoogleItem[] }
export interface GoogleResponse { responseId: string; respondentEmail?: string; lastSubmittedTime?: string; createTime?: string; totalScore?: number; answers?: Record<string, { textAnswers?: { answers?: { value: string }[] } }> }
export interface SyncMapping { participant?: string; name?: string; cohort?: string; state?: string; lga?: string; designation?: string }
export function googleQuestions(form: GoogleForm) {
  return (form.items ?? []).filter(item => item.questionItem?.question?.grading).map(item => {
    const q = item.questionItem?.question;
    const choice = q?.choiceQuestion;
    const keys = q?.grading?.correctAnswers?.answers ?? [];
    if (!choice || choice.type === "CHECKBOX" || keys.length !== 1) throw new Error(`“${item.title}” is not a verified single-answer choice question. Import reviewed keys separately.`);
    const options = (choice.options ?? []).map(o => ({ label: o.value, value: o.value }));
    if (options.length < 2 || !options.some(o => o.value === keys[0].value)) throw new Error(`“${item.title}” has no valid answer key.`);
    return { question_text: item.title ?? "", options, correct_answer: keys[0].value, points: q?.grading?.pointValue ?? 0 };
  });
}
export function googleResult(form: GoogleForm, response: GoogleResponse, mapping: SyncMapping, assessmentType: string) {
  const read = (id?: string) => id === "email" ? response.respondentEmail : id ? response.answers?.[id]?.textAnswers?.answers?.map(a => a.value).join(", ") : undefined;
  const key = read(mapping.participant ?? "email")?.trim().toLowerCase();
  if (!key) throw new Error(`Response ${response.responseId}: stable participant ID or collected email is required for pre/post matching.`);
  const max = (form.items ?? []).reduce((total, item) => total + (item.questionItem?.question?.grading?.pointValue ?? 0), 0);
  if (max <= 0 || response.totalScore === undefined) throw new Error(`Response ${response.responseId}: finalized quiz grading is unavailable; no score was guessed.`);
  const percentage = response.totalScore / max * 100;
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new Error("Google returned an invalid score.");
  return { participant_key: key, participant_name: read(mapping.name) || key, assessment_type: assessmentType, percentage, submitted_at: response.lastSubmittedTime ?? response.createTime, cohort: read(mapping.cohort) ?? null, state: read(mapping.state) ?? null, lga: read(mapping.lga) ?? null, designation: read(mapping.designation) ?? null };
}