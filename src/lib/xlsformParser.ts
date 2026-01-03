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

// Parse the type column which can include list references like "select_one list_name"
const parseType = (typeString: string): { type: QuestionType | null; listName?: string } => {
  if (!typeString) return { type: null };
  
  const parts = typeString.trim().toLowerCase().split(/\s+/);
  const baseType = parts[0];
  
  // Handle select_one and select_multiple with list references
  if (baseType === "select_one" || baseType === "select_multiple") {
    return {
      type: baseType as QuestionType,
      listName: parts[1],
    };
  }
  
  // Handle begin group/repeat
  if (baseType === "begin" || baseType === "begin_group" || baseType === "begin_repeat") {
    return { type: null };
  }
  
  if (baseType === "end" || baseType === "end_group" || baseType === "end_repeat") {
    return { type: null };
  }
  
  const mappedType = TYPE_MAPPING[baseType];
  return { type: mappedType || null };
};

// Get label from row (handle multiple language columns)
const getLabel = (row: XLSFormSurveyRow | XLSFormChoicesRow): string => {
  return (
    row.label ||
    row["label::English"] ||
    row["label::english"] ||
    (row as XLSFormSurveyRow).name ||
    ""
  );
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
      id: `opt-${index}-${Date.now()}`,
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
  
  // Parse common constraint patterns
  // e.g., ". >= 0 and . <= 100" or ". > 0"
  const minMatch = constraint.match(/\.\s*>=?\s*(-?\d+(?:\.\d+)?)/);
  const maxMatch = constraint.match(/\.\s*<=?\s*(-?\d+(?:\.\d+)?)/);
  const regexMatch = constraint.match(/regex\s*\(\s*\.\s*,\s*['"](.+?)['"]\s*\)/);
  
  if (minMatch) {
    validation.min = parseFloat(minMatch[1]);
  }
  if (maxMatch) {
    validation.max = parseFloat(maxMatch[1]);
  }
  if (regexMatch) {
    validation.regex = regexMatch[1];
  }
  
  return Object.keys(validation).length > 0 ? validation : undefined;
};

// Parse a single survey row into a Question
const parseQuestion = (
  row: XLSFormSurveyRow,
  choicesSheet: XLSFormChoicesRow[],
  index: number
): Question | null => {
  const { type, listName } = parseType(row.type);
  
  if (!type) return null;
  
  const question: Question = {
    id: `q-${row.name || index}-${Date.now()}`,
    type,
    label: getLabel(row),
    hint: row.hint,
    required: row.required?.toLowerCase() === "yes" || row.required === "true",
    relevant: row.relevant,
    constraint: row.constraint,
    constraintMessage: row.constraint_message,
    appearance: row.appearance,
    defaultValue: row.default,
    validation: parseConstraint(row.constraint),
  };
  
  // Add options for select questions
  if ((type === "select_one" || type === "select_multiple" || type === "rank") && listName) {
    question.options = parseChoices(choicesSheet, listName);
    
    // Add default options if none found
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
    
    // Get sheet names
    const sheetNames = workbook.SheetNames.map((name) => name.toLowerCase());
    
    // Find survey sheet
    const surveySheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === "survey"
    );
    if (!surveySheetName) {
      result.errors.push("Missing 'survey' sheet. XLSForm must have a 'survey' sheet.");
      return result;
    }
    
    // Find choices sheet (optional but usually present)
    const choicesSheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === "choices" || name.toLowerCase() === "options"
    );
    
    // Find settings sheet (optional)
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
        };
      }
    }
    
    // Track group state for nested groups
    const groupStack: { name: string; label: string; repeat: boolean; questions: Question[] }[] = [];
    let currentQuestions: Question[] = [];
    
    // Process survey rows
    for (let i = 0; i < surveyData.length; i++) {
      const row = surveyData[i];
      const typeLower = row.type?.toLowerCase().trim() || "";
      
      // Handle begin group/repeat
      if (typeLower === "begin_group" || typeLower === "begin group") {
        groupStack.push({
          name: row.name,
          label: getLabel(row),
          repeat: false,
          questions: [],
        });
        continue;
      }
      
      if (typeLower === "begin_repeat" || typeLower === "begin repeat") {
        groupStack.push({
          name: row.name,
          label: getLabel(row),
          repeat: true,
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
            id: `grp-${completedGroup.name}-${Date.now()}`,
            name: completedGroup.name,
            label: completedGroup.label,
            questions: completedGroup.questions,
            repeat: completedGroup.repeat,
          };
          
          // If there's a parent group, add this as a nested structure
          if (groupStack.length > 0) {
            // Add group's questions to parent (flattened for now)
            groupStack[groupStack.length - 1].questions.push(...completedGroup.questions);
          } else {
            result.groups.push(formGroup);
            // Also add to flat questions list
            currentQuestions.push(...completedGroup.questions);
          }
        }
        continue;
      }
      
      // Parse regular question
      const question = parseQuestion(row, choicesData, i);
      
      if (question) {
        if (groupStack.length > 0) {
          groupStack[groupStack.length - 1].questions.push(question);
        } else {
          currentQuestions.push(question);
        }
      } else if (row.type && !typeLower.startsWith("begin") && !typeLower.startsWith("end")) {
        // Unknown type warning
        result.warnings.push(
          `Row ${i + 2}: Unknown question type "${row.type}" for "${row.name}". Skipped.`
        );
      }
    }
    
    // Add any ungrouped questions
    result.questions = currentQuestions;
    
    // Summary
    if (result.questions.length === 0 && result.groups.length === 0) {
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
  
  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return {
      valid: false,
      error: "File too large. Maximum size is 10MB.",
    };
  }
  
  return { valid: true };
};

export default parseXLSForm;
