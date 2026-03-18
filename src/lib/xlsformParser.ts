import * as XLSX from "xlsx";
import { Question, QuestionType, QuestionOption, FormGroup } from "../components/FormBuilder/types";

interface XLSFormSurveyRow {
  type: string;
  name: string;
  label?: string;
  hint?: string;
  required?: string;
  relevant?: string;
  constraint?: string;
  constraint_message?: string;
  appearance?: string;
  default?: string;
  calculation?: string;
  choice_filter?: string;
  repeat_count?: string;
  "label::English"?: string;
  "label::english"?: string;
}

interface XLSFormChoicesRow {
  list_name: string;
  name: string;
  label?: string;
  "label::English"?: string;
  "label::english"?: string;
}

interface XLSFormSettingsRow {
  form_title?: string;
  form_id?: string;
  version?: string;
  default_language?: string;
  style?: string;
}

interface ParsedXLSForm {
  questions: Question[];
  groups: FormGroup[];
  settings: {
    formTitle?: string;
    formId?: string;
    version?: string;
    style?: string;
  };
  errors: string[];
  warnings: string[];
}

// Map XLSForm types to our native types
const TYPE_MAPPING: Record<string, QuestionType> = {
  text: "text",
  string: "text",
  integer: "number",
  int: "number",
  decimal: "number",
  select_one: "select_one",
  select_multiple: "select_multiple",
  date: "date",
  time: "time",
  datetime: "datetime",
  dateTime: "datetime",
  geopoint: "geopoint",
  geotrace: "geotrace",
  geoshape: "geoshape",
  image: "image",
  photo: "image",
  audio: "audio",
  video: "video",
  file: "file",
  barcode: "barcode",
  calculate: "calculate",
  note: "note",
  range: "range",
  rank: "rank",
  acknowledge: "acknowledge",
  signature: "signature",
  "draw": "signature",
};

// Build a dynamic column map from header row to handle variations in naming
const buildColumnMap = (headers: string[]): Record<string, string> => {
  const map: Record<string, string> = {};
  const normalizers: Record<string, string[]> = {
    type: ["type"],
    name: ["name", "variable", "field_name"],
    label: ["label"],
    hint: ["hint", "guidance_hint"],
    required: ["required", "mandatory"],
    relevant: ["relevant", "skip_logic", "display_logic"],
    constraint: ["constraint", "validation"],
    constraint_message: ["constraint_message", "validation_message"],
    appearance: ["appearance"],
    default: ["default"],
    calculation: ["calculation", "calculate"],
    choice_filter: ["choice_filter"],
    repeat_count: ["repeat_count"],
    list_name: ["list_name", "list name", "choice_list"],
  };

  for (const header of headers) {
    const lower = header.toLowerCase().trim().replace(/\s+/g, "_");
    for (const [canonical, aliases] of Object.entries(normalizers)) {
      if (aliases.includes(lower) || lower === canonical) {
        map[canonical] = header;
        break;
      }
    }
    // Handle label::language columns
    if (lower.startsWith("label::") || lower.startsWith("label :")) {
      if (!map["label"]) map["label"] = header;
    }
  }
  return map;
};

// Parse the type column which can include list references like "select_one list_name"
const parseType = (typeString: string): { type: QuestionType | null; listName?: string; isBeginGroup?: boolean; isEndGroup?: boolean; isBeginRepeat?: boolean; isEndRepeat?: boolean } => {
  if (!typeString) return { type: null };
  
  const parts = typeString.trim().split(/\s+/);
  const baseType = parts[0].toLowerCase();
  
  // Handle select_one and select_multiple with list references
  if (baseType === "select_one" || baseType === "select_multiple") {
    return {
      type: baseType as QuestionType,
      listName: parts[1],
    };
  }
  
  // Handle begin group/repeat
  if (baseType === "begin_group") {
    return { type: null, isBeginGroup: true };
  }
  if (baseType === "begin_repeat") {
    return { type: null, isBeginRepeat: true };
  }
  if (baseType === "begin") {
    const second = parts[1]?.toLowerCase();
    if (second === "repeat") return { type: null, isBeginRepeat: true };
    return { type: null, isBeginGroup: true }; // default: group
  }
  
  if (baseType === "end_group" || baseType === "end_repeat" || baseType === "end") {
    const second = parts[1]?.toLowerCase();
    return {
      type: null,
      isEndGroup: baseType === "end_group" || (baseType === "end" && second === "group"),
      isEndRepeat: baseType === "end_repeat" || (baseType === "end" && second === "repeat"),
    };
  }
  
  const mappedType = TYPE_MAPPING[baseType];
  return { type: mappedType || null };
};

// Get label from row (handle multiple language columns)
const getLabel = (row: XLSFormSurveyRow | XLSFormChoicesRow): string => {
  if (row.label && String(row.label).trim()) return String(row.label).trim();
  if (row["label::English"] && String(row["label::English"]).trim()) return String(row["label::English"]).trim();
  if (row["label::english"] && String(row["label::english"]).trim()) return String(row["label::english"]).trim();
  
  const rowObj = row as Record<string, any>;
  for (const key of Object.keys(rowObj)) {
    if (key.toLowerCase().startsWith("label::") && rowObj[key] && String(rowObj[key]).trim()) {
      return String(rowObj[key]).trim();
    }
  }
  
  const name = (row as XLSFormSurveyRow).name || "";
  if (name) {
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  
  return "";
};

// Parse choices/options for select questions
const parseChoices = (
  choicesSheet: XLSFormChoicesRow[],
  listName: string
): QuestionOption[] => {
  if (!choicesSheet || !listName) return [];
  
  return choicesSheet
    .filter((row) => row.list_name?.toLowerCase() === listName.toLowerCase())
    .map((row, index) => ({
      id: `opt-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      label: getLabel(row),
      value: row.name || `option_${index}`,
    }));
};

// Parse validation constraints
const parseConstraint = (constraint: string | undefined): {
  min?: number;
  max?: number;
  regex?: string;
} | undefined => {
  if (!constraint) return undefined;
  
  const validation: { min?: number; max?: number; regex?: string } = {};
  
  const minMatch = constraint.match(/\.\s*>=?\s*(-?\d+(?:\.\d+)?)/);
  const maxMatch = constraint.match(/\.\s*<=?\s*(-?\d+(?:\.\d+)?)/);
  const regexMatch = constraint.match(/regex\s*\(\s*\.\s*,\s*['"](.+?)['"]\s*\)/);
  
  if (minMatch) validation.min = parseFloat(minMatch[1]);
  if (maxMatch) validation.max = parseFloat(maxMatch[1]);
  if (regexMatch) validation.regex = regexMatch[1];
  
  return Object.keys(validation).length > 0 ? validation : undefined;
};

// Parse a single survey row into a Question
const parseQuestion = (
  row: XLSFormSurveyRow,
  choicesSheet: XLSFormChoicesRow[],
  index: number,
  nameTracker: Set<string>
): Question | null => {
  const { type, listName } = parseType(row.type);
  
  if (!type) return null;
  
  // Generate unique ID using the name field
  const baseName = row.name || `q${index}`;
  // Prevent duplicate questions by checking if this exact name was already processed
  const nameKey = `${baseName}_${type}`;
  if (nameTracker.has(nameKey)) return null;
  nameTracker.add(nameKey);
  
  const question: Question = {
    id: `q-${baseName}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type,
    label: getLabel(row),
    name: baseName, // Store XLSForm name for ${name} references
    hint: row.hint,
    required: row.required?.toLowerCase() === "yes" || row.required === "true",
    relevant: row.relevant ? String(row.relevant).trim() : undefined,
    constraint: row.constraint ? String(row.constraint).trim() : undefined,
    constraintMessage: row.constraint_message ? String(row.constraint_message).trim() : undefined,
    appearance: row.appearance,
    defaultValue: row.default,
    calculation: row.calculation ? String(row.calculation).trim() : undefined,
    choiceFilter: row.choice_filter ? String(row.choice_filter).trim() : undefined,
    validation: type === "calculate" ? undefined : parseConstraint(row.constraint),
  };
  
  // Calculate questions should never be required or have validation — they're auto-computed
  if (type === "calculate") {
    question.required = false;
  }
  
  // Add options for select questions
  if ((type === "select_one" || type === "select_multiple" || type === "rank") && listName) {
    question.options = parseChoices(choicesSheet, listName);
    
    if (question.options.length === 0) {
      question.options = [
        { id: `opt-1-${Date.now()}`, label: "Option 1", value: "option_1" },
        { id: `opt-2-${Date.now()}`, label: "Option 2", value: "option_2" },
      ];
    }
  }
  
  return question;
};

// Main parser function
export const parseXLSForm = async (file: File): Promise<ParsedXLSForm> => {
  const result: ParsedXLSForm = {
    questions: [],
    groups: [],
    settings: {},
    errors: [],
    warnings: [],
  };
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    
    // Find survey sheet
    const surveySheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === "survey"
    );
    if (!surveySheetName) {
      result.errors.push("Missing 'survey' sheet. XLSForm must have a 'survey' sheet.");
      return result;
    }
    
    // Find choices sheet
    const choicesSheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === "choices" || name.toLowerCase() === "options"
    );
    
    // Find settings sheet
    const settingsSheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === "settings"
    );
    
    // Parse survey sheet
    const surveySheet = workbook.Sheets[surveySheetName];
    const surveyData = XLSX.utils.sheet_to_json<XLSFormSurveyRow>(surveySheet, {
      defval: "",
    });
    
    // Parse choices sheet
    let choicesData: XLSFormChoicesRow[] = [];
    if (choicesSheetName) {
      const choicesSheet = workbook.Sheets[choicesSheetName];
      choicesData = XLSX.utils.sheet_to_json<XLSFormChoicesRow>(choicesSheet, {
        defval: "",
      });
    }
    
    // Parse settings sheet
    if (settingsSheetName) {
      const settingsSheet = workbook.Sheets[settingsSheetName];
      const settingsData = XLSX.utils.sheet_to_json<XLSFormSettingsRow>(settingsSheet, {
        defval: "",
      });
      
      if (settingsData.length > 0) {
        result.settings = {
          formTitle: settingsData[0].form_title,
          formId: settingsData[0].form_id,
          version: settingsData[0].version,
          style: settingsData[0].style,
        };
      }
    }
    
    // Track unique question names to prevent duplication
    const nameTracker = new Set<string>();
    
    // Track group state for nested groups
    const groupStack: { name: string; label: string; repeat: boolean; repeatCount?: number; relevant?: string; appearance?: string; questions: Question[] }[] = [];
    let currentQuestions: Question[] = [];
    
    // Process survey rows
    for (let i = 0; i < surveyData.length; i++) {
      const row = surveyData[i];
      const typeStr = row.type?.trim() || "";
      const typeLower = typeStr.toLowerCase();
      
      // Handle begin group
      if (typeLower === "begin_group" || typeLower === "begin group") {
        groupStack.push({
          name: row.name,
          label: getLabel(row),
          repeat: false,
          relevant: row.relevant,
          appearance: row.appearance,
          questions: [],
        });
        continue;
      }
      
      // Handle begin repeat
      if (typeLower === "begin_repeat" || typeLower === "begin repeat") {
        // Parse repeat_count from the row
        let repeatCount: number | undefined;
        const rcStr = (row as any).repeat_count;
        if (rcStr) {
          const parsed = parseInt(String(rcStr), 10);
          if (!isNaN(parsed) && parsed > 0) repeatCount = parsed;
        }
        groupStack.push({
          name: row.name,
          label: getLabel(row),
          repeat: true,
          repeatCount,
          relevant: row.relevant,
          appearance: row.appearance,
          questions: [],
        });
        continue;
      }
      
      // Handle end group/repeat
      if (
        typeLower === "end_group" ||
        typeLower === "end group" ||
        typeLower === "end_repeat" ||
        typeLower === "end repeat"
      ) {
        if (groupStack.length > 0) {
          const completedGroup = groupStack.pop()!;
          const formGroup: FormGroup = {
            id: `grp-${completedGroup.name}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name: completedGroup.name,
            label: completedGroup.label,
            questions: completedGroup.questions,
            repeat: completedGroup.repeat,
            repeatCount: completedGroup.repeatCount,
            allowDynamicRepeat: completedGroup.repeat,
            relevant: completedGroup.relevant,
          };
          
          if (groupStack.length > 0) {
            // Nested group: add questions to parent group (flattened)
            groupStack[groupStack.length - 1].questions.push(...completedGroup.questions);
          } else {
            result.groups.push(formGroup);
            // Do NOT also add to currentQuestions — this was causing duplication!
          }
        }
        continue;
      }
      
      // Parse regular question
      const question = parseQuestion(row, choicesData, i, nameTracker);
      
      if (question) {
        if (groupStack.length > 0) {
          groupStack[groupStack.length - 1].questions.push(question);
        } else {
          currentQuestions.push(question);
        }
      } else if (row.type && !typeLower.startsWith("begin") && !typeLower.startsWith("end")) {
        result.warnings.push(
          `Row ${i + 2}: Unknown question type "${row.type}" for "${row.name}". Skipped.`
        );
      }
    }
    
    // Close any unclosed groups
    while (groupStack.length > 0) {
      const unclosed = groupStack.pop()!;
      result.warnings.push(`Group "${unclosed.name}" was not properly closed. Questions were extracted.`);
      currentQuestions.push(...unclosed.questions);
    }
    
    // Set ungrouped questions (NOT including group questions - they stay in groups only)
    result.questions = currentQuestions;
    
    // Summary
    const totalQs = result.questions.length + result.groups.reduce((s, g) => s + g.questions.length, 0);
    if (totalQs === 0) {
      result.errors.push("No valid questions found in the XLSForm.");
    }
    
    if (!choicesSheetName && surveyData.some((row) => row.type?.includes("select"))) {
      result.warnings.push(
        "Select questions found but no 'choices' sheet. Default options will be used."
      );
    }
    
  } catch (error) {
    console.error("Error parsing XLSForm:", error);
    result.errors.push(`Failed to parse file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  
  return result;
};

// Validate XLSForm file before parsing
export const validateXLSFormFile = (file: File): { valid: boolean; error?: string } => {
  const validExtensions = [".xlsx", ".xls"];
  const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  
  if (!validExtensions.includes(extension)) {
    return {
      valid: false,
      error: "Invalid file type. Please upload an Excel file (.xlsx or .xls).",
    };
  }
  
  if (file.size > 10 * 1024 * 1024) {
    return {
      valid: false,
      error: "File too large. Maximum size is 10MB.",
    };
  }
  
  return { valid: true };
};

export default parseXLSForm;
