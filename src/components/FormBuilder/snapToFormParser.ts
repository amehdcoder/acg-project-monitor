// Heuristic parser that converts raw OCR text into a structured form schema.
// Zero AI credits, fully offline. Pairs with Tesseract.js OCR in SnapToFormDialog.
import type { QuestionType } from "./types";

export interface ParsedQuestion {
  name: string;
  label: string;
  hint?: string;
  type: QuestionType;
  required: boolean;
  options?: { value: string; label: string }[];
  validation?: { min?: number; max?: number; regex?: string; message?: string };
  relevant?: string;
  aiUpgrade?: string;
  confidence: number;
  sourcePage?: number;
}

export interface ParsedGroup {
  name: string;
  label: string;
  repeat?: boolean;
  relevant?: string;
  questions: ParsedQuestion[];
}

export interface ParsedForm {
  formName: string;
  formDescription?: string;
  detectedLanguage?: string;
  overallConfidence: number;
  groups: ParsedGroup[];
  suggestedUpgrades?: { title: string; rationale: string; appliedAsQuestionName?: string }[];
  warnings?: string[];
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || `field_${Math.random().toString(36).slice(2, 7)}`;

const SECTION_RE = /^(section\s+[a-z0-9]+|part\s+[ivx0-9]+|[a-z0-9][\w\s]{0,40}:)\s*$/i;
const REQUIRED_MARK = /[\*†]|\(required\)|\(mandatory\)/i;
const CHECKBOX_RE = /\[\s*[xX✓ ]?\s*\]|\(\s*\)|☐|☑|◯|○/;
const INLINE_CHOICES_RE = /(?:\[[^\]]*\]\s*[A-Za-z][^\[]{0,30})+/g;

function detectType(label: string, line: string): { type: QuestionType; options?: { value: string; label: string }[]; validation?: ParsedQuestion["validation"]; aiUpgrade?: string } {
  const l = label.toLowerCase();
  const full = line.toLowerCase();

  // Signature
  if (/sign(ature)?|signed by|sign here/i.test(l)) return { type: "signature" };
  // Photo / image
  if (/photo|picture|image|attach.*photo|evidence/i.test(l)) return { type: "image" };
  // GPS
  if (/gps|coordinates?|latitude|longitude|location of|site location/i.test(l))
    return { type: "geopoint" };
  // Date / time
  if (/\bdate\b|dob|date of/i.test(l)) return { type: "date" };
  if (/\btime\b/i.test(l)) return { type: "time" };
  // Phone
  if (/phone|mobile|tel\b|telephone/i.test(l))
    return {
      type: "text",
      validation: { regex: "^[+0-9 ()-]{7,20}$", message: "Enter a valid phone number" },
    };
  // Email
  if (/e[- ]?mail/i.test(l))
    return {
      type: "text",
      validation: { regex: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", message: "Enter a valid email" },
    };
  // Age / years
  if (/\bage\b|years old/i.test(l))
    return { type: "number", validation: { min: 0, max: 120 } };
  // Numeric hints
  if (/number of|count|quantity|how many|amount|total|weight|height|temperature|bp\b|pressure/i.test(l))
    return { type: "number" };

  // Inline checkbox options like "[ ] Male  [ ] Female"
  const inline = line.match(INLINE_CHOICES_RE);
  if (inline) {
    const opts = line
      .split(/\[[^\]]*\]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => ({ value: slugify(label), label }))
      .filter((o) => o.label.length <= 40);
    if (opts.length >= 2) {
      // Heuristic: 2 options or "yes/no" -> single; otherwise multi
      const isYesNo =
        opts.length === 2 && opts.every((o) => /^(yes|no|y|n|true|false)$/i.test(o.label));
      const single = opts.length <= 4 || isYesNo;
      return { type: single ? "select_one" : "select_multiple", options: opts };
    }
  }

  // Yes / No keyword pair
  if (/\byes\s*\/\s*no\b|\(y\s*\/\s*n\)/i.test(full))
    return {
      type: "select_one",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    };

  // Rating "1-5" or "1 to 10"
  const ratingMatch = l.match(/(\d+)\s*(?:to|-)\s*(\d+)/);
  if (ratingMatch && /rate|rating|score|scale/i.test(l)) {
    const min = Number(ratingMatch[1]);
    const max = Number(ratingMatch[2]);
    if (!isNaN(min) && !isNaN(max) && max > min) return { type: "range", validation: { min, max } };
  }

  return { type: "text" };
}

function isQuestionLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;
  if (/[:?_]/.test(trimmed)) return true;
  if (CHECKBOX_RE.test(trimmed)) return true;
  return false;
}

function extractLabel(line: string): string {
  // Strip leading numbering like "1.", "Q3:", "(a)"
  let s = line.replace(/^\s*(?:q?\d+[.)]\s*|\([a-z0-9]+\)\s*)/i, "");
  // Remove trailing blanks/underscores, colons
  s = s.replace(/[_…\.]{2,}.*$/g, "").replace(/[:?]\s*$/, "").trim();
  // Drop trailing inline checkboxes/options to keep just the label
  s = s.replace(/\[\s*[^\]]*\].*$/g, "").trim();
  return s.replace(/\s+/g, " ");
}

function detectRequired(line: string): boolean {
  return REQUIRED_MARK.test(line);
}

function detectSection(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return null;
  // ALL CAPS heading or "Section X:" / "Part X"
  if (/^[A-Z][A-Z0-9 \-&/]{3,}$/.test(trimmed)) return trimmed;
  if (SECTION_RE.test(trimmed)) return trimmed.replace(/:$/, "").trim();
  return null;
}

export function parseOcrTextToForm(pages: { text: string; pageNumber: number; confidence: number }[]): ParsedForm {
  const groups: ParsedGroup[] = [];
  const warnings: string[] = [];
  const seenNames = new Set<string>();

  let currentGroup: ParsedGroup = {
    name: "main",
    label: "Main",
    questions: [],
  };
  groups.push(currentGroup);

  let formName = "";
  let formDescription = "";
  let firstMeaningfulLines: string[] = [];

  for (const page of pages) {
    const lines = page.text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (page.pageNumber === 1) {
      firstMeaningfulLines = lines.slice(0, 5);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const section = detectSection(line);
      if (section) {
        const name = slugify(section);
        if (!groups.some((g) => g.name === name)) {
          currentGroup = { name, label: section.replace(/\b\w/g, (c) => c.toUpperCase()), questions: [] };
          groups.push(currentGroup);
        } else {
          currentGroup = groups.find((g) => g.name === name)!;
        }
        continue;
      }

      if (!isQuestionLine(line)) continue;

      const label = extractLabel(line);
      if (!label || label.length < 2) continue;

      const required = detectRequired(line);
      const det = detectType(label, line);

      let baseName = slugify(label);
      let candidate = baseName;
      let n = 2;
      while (seenNames.has(candidate)) candidate = `${baseName}_${n++}`;
      seenNames.add(candidate);

      // Heuristic confidence: OCR confidence + label clarity
      const ocrConf = Math.max(0.4, Math.min(1, page.confidence / 100));
      const labelClarity = label.length > 4 && /[a-z]/i.test(label) ? 0.95 : 0.7;
      const confidence = Math.round(ocrConf * labelClarity * 100) / 100;

      currentGroup.questions.push({
        name: candidate,
        label,
        type: det.type,
        required,
        options: det.options,
        validation: det.validation,
        confidence,
        sourcePage: page.pageNumber,
      });
    }
  }

  // Drop empty groups (besides last fallback)
  const nonEmpty = groups.filter((g) => g.questions.length > 0);
  const finalGroups = nonEmpty.length > 0 ? nonEmpty : groups;

  // Form name from first prominent line
  formName = firstMeaningfulLines[0] || "Imported Form";
  formName = formName.replace(/[_*=]+/g, "").trim().slice(0, 80) || "Imported Form";
  formDescription =
    firstMeaningfulLines.slice(1).join(" ").slice(0, 200) || undefined as any;

  // Suggested upgrades — applied automatically only if missing
  const allTypes = new Set(finalGroups.flatMap((g) => g.questions.map((q) => q.type)));
  const suggestedUpgrades: ParsedForm["suggestedUpgrades"] = [];
  if (!allTypes.has("geopoint")) {
    suggestedUpgrades.push({
      title: "Add GPS auto-capture",
      rationale: "Capture the location where this form was filled for verification and mapping.",
    });
  }
  if (!allTypes.has("image")) {
    suggestedUpgrades.push({
      title: "Add photo evidence",
      rationale: "Attach a photo as supporting evidence — improves data quality and audit.",
    });
  }
  if (!allTypes.has("signature")) {
    suggestedUpgrades.push({
      title: "Add signature",
      rationale: "Capture respondent or surveyor sign-off for accountability.",
    });
  }

  if (finalGroups.every((g) => g.questions.length === 0)) {
    warnings.push("No questions could be detected. Try a sharper photo or better lighting.");
  }

  const allConf = finalGroups.flatMap((g) => g.questions.map((q) => q.confidence));
  const overallConfidence =
    allConf.length > 0
      ? Math.round((allConf.reduce((a, b) => a + b, 0) / allConf.length) * 100) / 100
      : 0.5;

  return {
    formName,
    formDescription: formDescription || undefined,
    detectedLanguage: "en",
    overallConfidence,
    groups: finalGroups,
    suggestedUpgrades,
    warnings,
  };
}
