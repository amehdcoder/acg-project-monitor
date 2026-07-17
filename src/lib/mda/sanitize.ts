/**
 * Defensive normalization for MDA dashboard inputs.
 *
 * The Integrated MDA dashboards are fed by editable form JSON and historical
 * submissions, so old/corrupt option rows or missing submission fields must not
 * be able to crash the React render tree. These helpers preserve all original
 * properties while guaranteeing the fields the dashboard reads are safe.
 */

const isRecord = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const strOrUndefined = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  return String(v);
};

export function sanitizeMdaQuestions<T = any>(items: T[] | null | undefined): any[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, idx) => {
      if (!isRecord(item)) return null;
      const row = item as Record<string, any>;
      const id = String(row.id ?? row.name ?? `question_${idx}`);
      const name = strOrUndefined(row.name);
      const label = strOrUndefined(row.label ?? row.name ?? id);
      const type = strOrUndefined(row.type);

      const options = Array.isArray(row.options)
        ? row.options
            .map((opt: unknown, optIdx: number) => {
              if (!isRecord(opt)) return null;
              const label = String(opt.label ?? opt.value ?? `Option ${optIdx + 1}`);
              const value = String(opt.value ?? opt.label ?? label);
              return {
                ...opt,
                id: opt.id == null ? undefined : String(opt.id),
                label,
                value,
              };
            })
            .filter(Boolean)
        : undefined;

      const questions = Array.isArray(row.questions)
        ? sanitizeMdaQuestions(row.questions)
        : undefined;

      return {
        ...row,
        id,
        name,
        label,
        type,
        options,
        questions,
      };
    })
    .filter(Boolean);
}

export function sanitizeMdaSubmissions<T extends Record<string, any> = any>(items: T[] | null | undefined): T[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, idx) => {
      if (!isRecord(item)) return null;
      const data = isRecord(item.data) ? item.data : {};
      return {
        ...item,
        id: String(item.id ?? `submission_${idx}`),
        data,
        state: item.state == null ? null : String(item.state),
        lga: item.lga == null ? null : String(item.lga),
        ward: item.ward == null ? null : String(item.ward),
        submitter: item.submitter == null ? null : String(item.submitter),
        submittedAt: item.submittedAt == null ? null : String(item.submittedAt),
        status: item.status == null ? null : String(item.status),
      } as T;
    })
    .filter(Boolean) as T[];
}