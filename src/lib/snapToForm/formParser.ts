// Heuristic, fully-offline paper-form → digital-form parser.
// Converts OCR lines into structured groups + questions with smart type inference.

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
// Pattern detection
// ---------------------------------------------------------------------------

// Lines like "Name:", "Date of Birth:", "Phone Number ___________"
const QUESTION_LINE = /^([A-Z0-9].{1,80}?)[\s:.\u2026]+(_{2,}|\.{4,}|\[ ?\]|\([ \w/]+\)|$)/;
const COLON_LINE = /^([A-Z0-9][^:]{1,80}):\s*(.*)$/;

// Checkbox markers: [ ], [x], (), ☐, ☑, □, ■, o, ○
const CHECKBOX_RE = /(\[\s?[xX✓]?\s?\]|\(\s?[xX✓]?\s?\)|[☐☑□■◯○●])/g;
const INLINE_OPTION_SPLIT = /[│|]|\s{2,}/g;

const REQUIRED_HINT = /\*|\(required\)|mandatory|must|obligatory/i;
const SECTION_HEADING = /^(SECTION|PART|STEP|MODULE)\s+[A-Z0-9]+\b|^[A-Z][A-Z\s&/()-]{4,25}$/;
const REPEAT_HINT = /for each|per (child|household|case|patient|site|visit)|list (up to|all)|repeat|row\s*[0-9]|add\s*another/i;
const SKIP_HINT = /(?:if|only if)\s+(.+?)(?:,\s*|\s+)(?:go to|skip to|complete|answer|then|refer to|skip)\s+([A-Z0-9_.\s]+)/i;
const CALC_HINT = /(?:total|sum|average|percentage|rate|bmi|ratio)\s+(?:of|is|calculated|based on)\s+(.+)/i;


// Type hints (left-to-right priority)
const TYPE_RULES: Array<{
  re: RegExp;
  type: QuestionType;
  validation?: ParsedQuestion["validation"];
  upgrade?: string;
}> = [
  { re: /\b(date of birth|dob|date)\b/i, type: "date" },
  { re: /\btime\b/i, type: "time" },
  { re: /\b(phone|mobile|tel)\b/i, type: "text", validation: { regex: "^[+0-9\\s()-]{7,}$", message: "Enter a valid phone number" } },
  { re: /\bemail\b/i, type: "text", validation: { regex: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message: "Enter a valid email" } },
  { re: /\b(age|count|number of|qty|quantity|weight|height|temperature|dose|years)\b/i, type: "number" },
  { re: /\b(gps|coordinates|latitude|longitude|location of|site location)\b/i, type: "geopoint", upgrade: "Detected location field — using GPS auto-capture." },
  { re: /\b(photo|picture|image|attach|upload).*(evidence|here|of)?/i, type: "image", upgrade: "Detected photo field — using camera capture." },
  { re: /\bsignature|sign here|signed by\b/i, type: "signature", upgrade: "Detected signature field — using touch signature pad." },
  { re: /\b(barcode|qr code|scan id)\b/i, type: "barcode" },
  { re: /\b(rate|rating|scale|score).*(1[\s-]?(?:to|-)\s?(?:5|10))/i, type: "range", validation: { min: 1, max: 10 } },
  { re: /\b(notes?|comments?|describe|explain|remarks?)\b/i, type: "text" },
];

const NUMBER_RANGE = /\((\d+)\s*[-–]\s*(\d+)\)/;

// ---------------------------------------------------------------------------
// Line grouping (uses bbox y to detect paragraphs / sections)
// ---------------------------------------------------------------------------

function groupLinesByVerticalGap(lines: OcrLine[]): OcrLine[][] {
  if (lines.length === 0) return [];
  // Sort by y then x
  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const heights = sorted.map((l) => l.bbox.y1 - l.bbox.y0).filter((h) => h > 0);
  const medianH = heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] || 20;
  const gapThreshold = medianH * 1.8;

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
// Per-line parsing
// ---------------------------------------------------------------------------

function inferType(label: string, hint?: string): { type: QuestionType; validation?: ParsedQuestion["validation"]; upgrade?: string } {
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
  // Pattern: "[ ] Male  [ ] Female  [ ] Other"
  if (CHECKBOX_RE.test(rawText)) {
    CHECKBOX_RE.lastIndex = 0;
    const parts = rawText.split(CHECKBOX_RE).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      // Split further if separators exist
      const subs = p.split(INLINE_OPTION_SPLIT).map((s) => s.trim()).filter((s) => s && s.length < 40 && /[a-z]/i.test(s));
      found.push(...subs);
    }
  }
  // Pattern: "Male / Female / Other"
  if (found.length === 0 && /\s\/\s/.test(rawText) && rawText.length < 80) {
    const parts = rawText.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.length <= 8 && parts.every((p) => p.length < 30)) {
      found.push(...parts);
    }
  }
  if (found.length === 0) return undefined;
  const seen = new Set<string>();
  const opts = found
    .filter((label) => {
      const k = label.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 12)
    .map((label) => ({ value: slugify(label), label }));
  return opts.length >= 2 ? opts : undefined;
}

function cleanLabel(s: string): string {
  return s
    .replace(/[_.]{3,}/g, "")
    .replace(/\s+/g, " ")
    .replace(/[:;,\s]+$/g, "")
    .trim();
}

function isSectionHeading(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (SECTION_HEADING.test(t)) return true;
  // Bold-ish "Patient Details" all-title-case with no colon
  if (!/[:?_]/.test(t) && /^[A-Z][A-Za-z\s/&-]+$/.test(t) && t.split(" ").length <= 6) {
    const words = t.split(/\s+/);
    const titleWords = words.filter((w) => /^[A-Z]/.test(w)).length;
    return titleWords === words.length;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Advanced Refinement: Line Merging & Contextual Recovery
// ---------------------------------------------------------------------------

function mergeFragmentedLines(lines: OcrLine[]): OcrLine[] {
  if (lines.length < 2) return lines;
  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const merged: OcrLine[] = [];
  
  let current = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const yOverlap = Math.min(current.bbox.y1, next.bbox.y1) - Math.max(current.bbox.y0, next.bbox.y0);
    const h = current.bbox.y1 - current.bbox.y0;
    
    // Same visual line (y-overlap > 60% of height) and close enough on x
    if (yOverlap > h * 0.6 && next.bbox.x0 - current.bbox.x1 < h * 2) {
      current = {
        text: current.text + " " + next.text,
        bbox: {
          x0: Math.min(current.bbox.x0, next.bbox.x0),
          y0: Math.min(current.bbox.y0, next.bbox.y0),
          x1: Math.max(current.bbox.x1, next.bbox.x1),
          y1: Math.max(current.bbox.y1, next.bbox.y1)
        },
        confidence: (current.confidence + next.confidence) / 2
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  return merged;
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
    const mergedLines = mergeFragmentedLines(page.lines);
    const lineGroups = groupLinesByVerticalGap(mergedLines);


    // Try to grab a form title from the first 1–2 lines of page 1
    if (pageIdx === 0 && !formName) {
      const candidates = page.lines.slice(0, 4).filter((l) => l.text.length > 4 && l.text.length < 80);
      const titleLine = candidates.find((l) => /^[A-Z][A-Z\s&/'-]{4,}$/.test(l.text.trim())) || candidates[0];
      if (titleLine) formName = cleanLabel(titleLine.text);
    }

    for (const group of lineGroups) {
      const blockText = group.map((l) => l.text).join(" ");
      const firstLine = group[0].text.trim();

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
      const skipMatch = blockText.match(SKIP_HINT);
      if (skipMatch) {
        // Best-effort: reference the previous question by name
        const prev = currentGroup.questions[currentGroup.questions.length - 1];
        if (prev) {
          pendingRelevant = `\${${prev.name}} = 'yes'`;
        }
      }

      // Identify question candidate
      let label = "";
      let rest = "";
      const colon = blockText.match(COLON_LINE);
      const qLine = blockText.match(QUESTION_LINE);
      if (colon) {
        label = colon[1];
        rest = colon[2] || "";
      } else if (qLine) {
        label = qLine[1];
        rest = blockText.slice(qLine[0].length);
      } else if (group.length === 1 && firstLine.length < 100 && /[A-Za-z]/.test(firstLine)) {
        // Standalone short line — could be a yes/no question if it ends with "?"
        if (/\?\s*$/.test(firstLine) || REQUIRED_HINT.test(firstLine)) {
          label = firstLine.replace(/\?$/, "");
          rest = "";
        } else {
          continue;
        }
      } else {
        continue;
      }

      label = cleanLabel(label);
      if (!label || label.length < 2) continue;

      const required = REQUIRED_HINT.test(blockText) || /^\*/.test(label) || /\b(name|id|date)\b/i.test(label);
      const cleanedLabel = label.replace(/^\*\s*/, "").replace(/\s*\(required\)/i, "").trim();

      const options = extractOptions(blockText) || extractOptions(rest);
      const inferred = inferType(cleanedLabel, rest);
      let type: QuestionType = inferred.type;
      if (options && options.length >= 2) {
        // Multiple checkboxes → multi-select; two checkboxes with yes/no → single
        const hasMultipleMarks = (blockText.match(CHECKBOX_RE) || []).length >= 3;
        type = hasMultipleMarks ? "select_multiple" : "select_one";
      }

      // Advanced Logic Inference
      let relevant = pendingRelevant;
      let calculation: string | undefined;
      
      // 1. Detect Skip Logic in the label itself
      const inlineSkip = blockText.match(SKIP_HINT);
      if (inlineSkip) {
        const condition = inlineSkip[1];
        const target = inlineSkip[2];
        relevant = `\${${slugify(condition)}} = 'yes'`;
        // We'll try to map target to question names in a second pass
      }
      
      // 2. Detect Formulas
      const formulaMatch = blockText.match(CALC_HINT);
      if (formulaMatch) {
        type = "calculate";
        const parts = formulaMatch[1].split(/,|and|plus|\+/i).map(s => slugify(s.trim()));
        calculation = parts.length > 1 ? parts.map(p => `\${${p}}`).join(" + ") : undefined;
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
        relevant,
        aiUpgrade: calculation ? `Auto-generated calculation: ${calculation}` : inferred.upgrade,
        confidence: Math.max(0.3, Math.min(0.99, conf)),
        sourcePage: pageIdx + 1,
        sourceText: blockText.slice(0, 200),
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

  // Second Pass: Link skip logic to actual question names
  const allQs = groups.flatMap(g => g.questions);
  allQs.forEach(q => {
    if (q.relevant && q.relevant.includes("${")) {
      // Find the question that matches the condition text
      const match = q.relevant.match(/\${(.+?)}/);
      if (match) {
        const condText = match[1];
        const targetQ = allQs.find(other => 
          other.name.includes(condText) || 
          condText.includes(other.name) ||
          other.label.toLowerCase().includes(condText.replace(/_/g, " "))
        );
        if (targetQ) q.relevant = q.relevant.replace(`\${${condText}}`, `\${${targetQ.name}}`);
      }
    }
  });


  // Drop empty groups
  const cleanGroups = groups.filter((g) => g.questions.length > 0);
  if (cleanGroups.length === 0) {
    warnings.push("No fields could be detected. Try a clearer photo with brighter lighting.");
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

// Re-extract a single question from its source text (used by the per-field "Re-ask" button).
export function reextractQuestion(sourceText: string, currentLabel: string): Partial<ParsedQuestion> {
  const blockText = sourceText || currentLabel;
  const options = extractOptions(blockText);
  const inferred = inferType(currentLabel, blockText);
  let type = inferred.type;
  if (options && options.length >= 2) {
    const hasMultipleMarks = (blockText.match(CHECKBOX_RE) || []).length >= 3;
    type = hasMultipleMarks ? "select_multiple" : "select_one";
  }
  return {
    type,
    options,
    validation: inferred.validation,
    aiUpgrade: inferred.upgrade,
    confidence: 0.85,
  };
}
