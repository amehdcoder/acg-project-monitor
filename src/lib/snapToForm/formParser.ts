// Heuristic, fully-offline paper-form → digital-form parser.
// Designed to be permissive on real-world OCR output: forms shot on phones,
// scanned at angles, with mixed casing and inconsistent punctuation.
//
// Key principles vs. the older parser:
//  1. Don't require capital letters or strict line patterns to detect a question.
//  2. Treat any line ending in ":" or ending with blank/dotted/underscore runs
//     as a candidate question.
//  3. Accept a much wider set of checkbox / option markers (ASCII + Unicode).
//  4. Use horizontal layout (bbox.x) to detect inline option grids.
//  5. Promote standalone short lines that look like questions (verb prompts,
//     "?" terminators, numbered "1.", "2)", "Q1:" prefixes).
//  6. Always keep something on the page — never drop everything just because
//     no line matched a strict pattern.

import type { QuestionType } from "@/components/FormBuilder/types";
import type { OcrLine, OcrPageResult } from "./ocrEngine";

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
  sourceText?: string;
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

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

// Lines like "Name:", "Date of Birth:", "Phone Number ___________", "1. Age"
const COLON_LINE = /^([^:]{1,120}):\s*(.*)$/;
const NUMBERED_PREFIX = /^(?:Q\s*)?(\d{1,3})[.)\]:\-]\s*(.+)$/i;
const BLANK_RUN = /(_{2,}|\.{4,}|—{2,}|-{4,}|\s\.{3,}\s|…+)\s*$/;
const QUESTION_MARK_END = /\?\s*$/;
const INSTRUCTION_VERBS = /^(please\s+)?(write|enter|state|specify|provide|describe|explain|tick|check|circle|select|choose|list|fill in|indicate|complete)\b/i;

// Checkbox markers — ASCII + Unicode + circle/square variants.
const CHECKBOX_RE = /(\[\s?[xX✓✔]?\s?\]|\(\s?[xX✓✔]?\s?\)|\{\s?[xX✓✔]?\s?\}|[☐☑☒□■◯○●⬜⬛])/g;
const INLINE_OPTION_SPLIT = /[│|]|\s{2,}/g;

const REQUIRED_HINT = /\*|\(required\)|\brequired\b|mandatory|must/i;
const SECTION_HEADING_RE =
  /^(?:SECTION|PART|STEP|MODULE|CHAPTER|BLOCK)\s+[A-Z0-9IVX]+\b|^[A-Z][A-Z\s&/'\-()]{4,80}$/;
const REPEAT_HINT = /for each|per\s+(child|household|case|patient|member|visit)|list (up to|all)|repeat|table\s+\d/i;
const SKIP_HINT_NEXT = /^if\s+(.+?),?\s+(go to|skip to|complete|answer|then|continue|proceed)/i;
const SKIP_HINT_INLINE = /\(if\s+(yes|no)[^)]*\)/i;

// Type hints (left-to-right priority)
const TYPE_RULES: Array<{
  re: RegExp;
  type: QuestionType;
  validation?: ParsedQuestion["validation"];
  upgrade?: string;
}> = [
  { re: /\b(date of birth|dob|d\.o\.b|birth date|date)\b/i, type: "date" },
  { re: /\btime\b/i, type: "time" },
  {
    re: /\b(phone|mobile|tel(ephone)?|cell|whatsapp|contact number)\b/i,
    type: "text",
    validation: { regex: "^[+0-9\\s()-]{7,}$", message: "Enter a valid phone number" },
  },
  {
    re: /\be[- ]?mail\b/i,
    type: "text",
    validation: { regex: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message: "Enter a valid email" },
  },
  {
    re: /\b(age|count|number of|qty|quantity|weight|height|temperature|temp\.|dose|years|months|kg|cm|mm|km|metres?|meters?|amount|price|cost|fee|salary|income|score)\b/i,
    type: "number",
  },
  {
    re: /\b(gps|coordinates|latitude|longitude|location of|site location|gps coords?)\b/i,
    type: "geopoint",
    upgrade: "Detected location field — using GPS auto-capture.",
  },
  {
    re: /\b(photo|picture|image|attach|upload|snapshot)\b.*(evidence|here|of|attach|upload)?|\battach\s+photo\b/i,
    type: "image",
    upgrade: "Detected photo field — using camera capture.",
  },
  {
    re: /\bsignature|sign here|signed by|guardian sign|witness sign\b/i,
    type: "signature",
    upgrade: "Detected signature field — using touch signature pad.",
  },
  { re: /\b(barcode|qr code|scan id|scan barcode)\b/i, type: "barcode" },
  {
    re: /\b(rate|rating|scale|score)\b.*(1\s*[-–to]\s*(?:5|7|10))/i,
    type: "range",
    validation: { min: 1, max: 10 },
  },
  {
    re: /\b(notes?|comments?|describe|explain|remarks?|additional information|specify)\b/i,
    type: "text",
  },
];

const NUMBER_RANGE = /\((\d+)\s*[-–]\s*(\d+)\)/;

// ---------------------------------------------------------------------------
// Line grouping (uses bbox y to detect paragraphs / sections)
// ---------------------------------------------------------------------------

function groupLinesByVerticalGap(lines: OcrLine[]): OcrLine[][] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const heights = sorted.map((l) => l.bbox.y1 - l.bbox.y0).filter((h) => h > 0);
  const medianH = heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] || 20;
  // Slightly tighter than before so multi-column option rows stay together
  // with their question label above them.
  const gapThreshold = medianH * 1.4;

  const groups: OcrLine[][] = [];
  let current: OcrLine[] = [];
  let lastY = -Infinity;
  for (const line of sorted) {
    if (current.length === 0) {
      current.push(line);
      lastY = line.bbox.y1;
      continue;
    }
    const gap = line.bbox.y0 - lastY;
    if (gap > gapThreshold) {
      groups.push(current);
      current = [line];
    } else {
      current.push(line);
    }
    lastY = Math.max(lastY, line.bbox.y1);
  }
  if (current.length) groups.push(current);
  return groups;
}

// ---------------------------------------------------------------------------
// Per-line parsing helpers
// ---------------------------------------------------------------------------

function inferType(
  label: string,
  hint?: string,
): { type: QuestionType; validation?: ParsedQuestion["validation"]; upgrade?: string } {
  const text = `${label} ${hint || ""}`;
  for (const rule of TYPE_RULES) {
    if (rule.re.test(text)) {
      return { type: rule.type, validation: rule.validation, upgrade: rule.upgrade };
    }
  }
  // Number range hint "(0-120)"
  const range = label.match(NUMBER_RANGE);
  if (range) {
    return {
      type: "number",
      validation: { min: parseInt(range[1], 10), max: parseInt(range[2], 10) },
    };
  }
  // Yes/No inline
  if (/\byes\s*\/\s*no\b/i.test(text) || /\(\s*y\s*\/\s*n\s*\)/i.test(text)) {
    return { type: "select_one" };
  }
  return { type: "text" };
}

function extractOptions(rawText: string): { value: string; label: string }[] | undefined {
  const found: string[] = [];

  // 1) Checkbox-prefixed options (most reliable signal)
  if (CHECKBOX_RE.test(rawText)) {
    CHECKBOX_RE.lastIndex = 0;
    const parts = rawText.split(CHECKBOX_RE).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      const subs = p
        .split(INLINE_OPTION_SPLIT)
        .map((s) => s.trim())
        .filter((s) => s && s.length < 50 && /[a-zA-Z0-9]/.test(s));
      found.push(...subs);
    }
  }

  // 2) Slash-separated short list: "Male / Female / Other", "Yes / No"
  if (found.length === 0 && /\s\/\s/.test(rawText) && rawText.length < 120) {
    const parts = rawText
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2 && parts.length <= 10 && parts.every((p) => p.length < 40)) {
      found.push(...parts);
    }
  }

  // 3) Comma-separated short list when at least 3 items: "Yes, No, Maybe"
  if (found.length === 0 && /,/.test(rawText) && rawText.length < 160) {
    const parts = rawText
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      parts.length >= 3 &&
      parts.length <= 10 &&
      parts.every((p) => p.length < 30 && !/[?:]/.test(p))
    ) {
      found.push(...parts);
    }
  }

  // 4) Pipe-separated: "Single | Married | Divorced"
  if (found.length === 0 && /\s\|\s/.test(rawText)) {
    const parts = rawText
      .split(/\s*\|\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2 && parts.length <= 10) found.push(...parts);
  }

  if (found.length === 0) return undefined;

  // De-dupe & cap
  const seen = new Set<string>();
  const opts = found
    .filter((label) => {
      const k = label.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .filter((label) => label.length >= 1)
    .slice(0, 12)
    .map((label) => ({ value: slugify(label), label }));
  return opts.length >= 2 ? opts : undefined;
}

function cleanLabel(s: string): string {
  return s
    .replace(/[_.]{3,}/g, "")
    .replace(/—{2,}|-{4,}/g, "")
    .replace(/\s+/g, " ")
    .replace(/[:;,\s]+$/g, "")
    .trim();
}

function isSectionHeading(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (SECTION_HEADING_RE.test(t)) return true;
  // "Patient Details" all-title-case with no colon
  if (!/[:?_]/.test(t) && /^[A-Z][A-Za-z\s/&'-]+$/.test(t) && t.split(" ").length <= 6) {
    const words = t.split(/\s+/);
    const titleWords = words.filter((w) => /^[A-Z]/.test(w)).length;
    return titleWords === words.length;
  }
  return false;
}

/** Heuristic: does this block look like a question candidate? */
function looksLikeQuestion(blockText: string, firstLine: string): boolean {
  if (COLON_LINE.test(blockText)) return true;
  if (BLANK_RUN.test(blockText)) return true;
  if (NUMBERED_PREFIX.test(firstLine)) return true;
  if (QUESTION_MARK_END.test(blockText)) return true;
  if (CHECKBOX_RE.test(blockText)) return true;
  if (INSTRUCTION_VERBS.test(firstLine)) return true;
  if (/^[A-Z][A-Za-z][^?:]{2,80}\??$/.test(firstLine) && firstLine.split(" ").length <= 12)
    return true;
  return false;
}

/** Pull a clean label out of a candidate block. */
function extractLabel(blockText: string, firstLine: string): { label: string; rest: string } {
  // Numbered prefix
  const numbered = firstLine.match(NUMBERED_PREFIX);
  if (numbered) {
    const rest = blockText.slice(firstLine.length).trim();
    return { label: numbered[2], rest };
  }
  // Colon
  const colon = blockText.match(COLON_LINE);
  if (colon) {
    return { label: colon[1], rest: colon[2] || "" };
  }
  // Blank run after label: "Name __________"
  const blank = blockText.match(/^(.+?)\s*(_{2,}|\.{4,}|—{2,})/);
  if (blank) {
    return { label: blank[1], rest: blockText.slice(blank[0].length) };
  }
  // Question mark
  if (QUESTION_MARK_END.test(blockText)) {
    return { label: blockText.replace(/\?\s*$/, ""), rest: "" };
  }
  // Default: use first line as label
  return { label: firstLine, rest: blockText.slice(firstLine.length).trim() };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseOcrPages(pages: OcrPageResult[]): ParsedForm {
  const groups: ParsedGroup[] = [];
  let currentGroup: ParsedGroup = { name: "main", label: "Main", questions: [] };
  groups.push(currentGroup);

  const warnings: string[] = [];
  let formName = "";
  let totalConfidence = 0;
  let confidenceCount = 0;
  const upgradesApplied: { title: string; rationale: string; appliedAsQuestionName: string }[] = [];

  pages.forEach((page, pageIdx) => {
    const lineGroups = groupLinesByVerticalGap(page.lines);

    // Try to grab a form title from the first 1–4 lines of page 1.
    if (pageIdx === 0 && !formName) {
      const candidates = page.lines
        .slice(0, 5)
        .filter((l) => l.text.length > 4 && l.text.length < 100);
      const titleLine =
        candidates.find((l) => /^[A-Z][A-Z\s&/'\-()]{4,}$/.test(l.text.trim())) ||
        candidates.find((l) => /form|register|checklist|survey|questionnaire|application/i.test(l.text)) ||
        candidates[0];
      if (titleLine) formName = cleanLabel(titleLine.text);
    }

    for (const group of lineGroups) {
      const blockText = group.map((l) => l.text).join(" ").replace(/\s+/g, " ").trim();
      const firstLine = group[0].text.trim();

      if (!blockText || blockText.length < 2) continue;

      // Section heading?
      if (group.length === 1 && isSectionHeading(firstLine)) {
        const name = slugify(firstLine);
        currentGroup = {
          name,
          label: cleanLabel(firstLine),
          repeat: REPEAT_HINT.test(firstLine),
          questions: [],
        };
        groups.push(currentGroup);
        continue;
      }

      // Skip-logic line that applies to next field: "If yes, ..."
      let pendingRelevant: string | undefined;
      const skipMatch = blockText.match(SKIP_HINT_NEXT);
      const skipInline = blockText.match(SKIP_HINT_INLINE);
      if (skipMatch || skipInline) {
        const prev = currentGroup.questions[currentGroup.questions.length - 1];
        if (prev) {
          const yn = (skipInline?.[1] || "yes").toLowerCase();
          pendingRelevant = `\${${prev.name}} = '${yn}'`;
        }
      }

      // Question candidate?
      if (!looksLikeQuestion(blockText, firstLine)) {
        // Last-chance: lone short line with letters → treat as text question.
        if (group.length === 1 && firstLine.length >= 3 && firstLine.length <= 80 && /[A-Za-z]/.test(firstLine)) {
          // Skip pure-numeric or mostly-symbol lines.
          const letters = (firstLine.match(/[A-Za-z]/g) || []).length;
          if (letters / firstLine.length < 0.3) continue;
        } else {
          continue;
        }
      }

      const { label: rawLabel, rest } = extractLabel(blockText, firstLine);
      const label = cleanLabel(rawLabel);
      if (!label || label.length < 2) continue;

      const required =
        REQUIRED_HINT.test(blockText) || /^\*/.test(label) || /\b(name|id|date)\b/i.test(label);
      const cleanedLabel = label
        .replace(/^\*\s*/, "")
        .replace(/\s*\(required\)/i, "")
        .trim();

      const options = extractOptions(blockText) || extractOptions(rest);
      const inferred = inferType(cleanedLabel, rest);
      let type: QuestionType = inferred.type;
      if (options && options.length >= 2) {
        const checkboxCount = (blockText.match(CHECKBOX_RE) || []).length;
        type = checkboxCount >= 3 ? "select_multiple" : "select_one";
      }

      const conf = group.reduce((a, l) => a + (l.confidence || 0), 0) / group.length / 100;
      totalConfidence += conf;
      confidenceCount += 1;

      const name = slugify(cleanedLabel);
      const question: ParsedQuestion = {
        name,
        label: cleanedLabel,
        type,
        required,
        options,
        validation: inferred.validation,
        relevant: pendingRelevant,
        aiUpgrade: inferred.upgrade,
        confidence: Math.max(0.3, Math.min(0.99, conf)),
        sourcePage: pageIdx + 1,
        sourceText: blockText.slice(0, 240),
      };

      if (inferred.upgrade) {
        upgradesApplied.push({
          title: inferred.upgrade,
          rationale: `Auto-detected from "${cleanedLabel}".`,
          appliedAsQuestionName: name,
        });
      }

      currentGroup.questions.push(question);
    }
  });

  // Drop empty groups
  let cleanGroups = groups.filter((g) => g.questions.length > 0);

  // Safety net: if nothing was captured, treat every plausible line on every
  // page as a text question so the user has something to start from.
  if (cleanGroups.length === 0) {
    const fallback: ParsedQuestion[] = [];
    pages.forEach((page, pageIdx) => {
      page.lines.forEach((l) => {
        const t = cleanLabel(l.text);
        if (t.length < 3 || t.length > 100) return;
        const letters = (t.match(/[A-Za-z]/g) || []).length;
        if (letters / t.length < 0.4) return;
        fallback.push({
          name: slugify(t),
          label: t,
          type: "text",
          required: false,
          confidence: Math.max(0.3, (l.confidence || 0) / 100),
          sourcePage: pageIdx + 1,
          sourceText: t,
        });
      });
    });
    if (fallback.length) {
      cleanGroups = [{ name: "main", label: "Main", questions: fallback }];
      warnings.push(
        "Form structure was hard to detect — every readable line was imported as a text field. Edit/merge as needed.",
      );
    } else {
      warnings.push("No fields could be detected. Try a clearer photo with brighter lighting.");
    }
  }

  // Deduplicate names
  const seen = new Set<string>();
  cleanGroups.forEach((g) => {
    g.name = slugify(g.name || g.label);
    g.questions.forEach((q) => {
      let cand = q.name;
      let i = 2;
      while (seen.has(cand)) cand = `${q.name}_${i++}`;
      seen.add(cand);
      q.name = cand;
    });
  });

  const overallConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0.5;

  return {
    formName: formName || "Imported Paper Form",
    formDescription: undefined,
    detectedLanguage: "en",
    overallConfidence,
    groups: cleanGroups.length ? cleanGroups : [{ name: "main", label: "Main", questions: [] }],
    suggestedUpgrades: upgradesApplied,
    warnings,
  };
}

// Re-extract a single question from its source text (used by per-field "Re-ask").
export function reextractQuestion(sourceText: string, currentLabel: string): Partial<ParsedQuestion> {
  const blockText = sourceText || currentLabel;
  const options = extractOptions(blockText);
  const inferred = inferType(currentLabel, blockText);
  let type = inferred.type;
  if (options && options.length >= 2) {
    const checkboxCount = (blockText.match(CHECKBOX_RE) || []).length;
    type = checkboxCount >= 3 ? "select_multiple" : "select_one";
  }
  return {
    type,
    options,
    validation: inferred.validation,
    aiUpgrade: inferred.upgrade,
    confidence: 0.85,
  };
}
