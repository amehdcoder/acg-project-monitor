export type QuestionType =
  | "text"
  | "number"
  | "select_one"
  | "select_multiple"
  | "date"
  | "time"
  | "datetime"
  | "geopoint"
  | "geotrace"
  | "geoshape"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "barcode"
  | "calculate"
  | "note"
  | "range"
  | "rank"
  | "matrix"
  | "signature"
  | "acknowledge";

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  name?: string; // XLSForm name field for ${name} references
  hint?: string;
  required: boolean;
  options?: QuestionOption[];
  validation?: {
    min?: number;
    max?: number;
    regex?: string;
  };
  appearance?: string;
  relevant?: string;
  constraint?: string;
  constraintMessage?: string;
  defaultValue?: string;
  calculation?: string; // Calculate expression using ${name} references
  choiceFilter?: string; // Choice filter expression for cascading selects
  /**
   * Display format for date / datetime questions. Stored values remain ISO
   * (YYYY-MM-DD or YYYY-MM-DDTHH:mm) — this only controls the on-screen
   * representation and parsing inside the form filler.
   */
  dateFormat?:
    | "DD/MM/YYYY"
    | "MM/DD/YYYY"
    | "YYYY-MM-DD"
    | "DD-MM-YYYY"
    | "DD.MM.YYYY"
    | "DD MMM YYYY"
    | "MMM DD, YYYY"
    | "DD MMMM YYYY"
    | "MMMM DD, YYYY";
}

export interface FormGroup {
  id: string;
  name: string;
  label: string;
  questions: Question[];
  repeat?: boolean;
  repeatCount?: number;
  allowDynamicRepeat?: boolean;
  relevant?: string;
  constraint?: string;
  constraintMessage?: string;
}

export interface GeofenceArea {
  id: string;
  name: string;
  coordinates: [number, number][];
  enabled: boolean;
}

export interface FormData {
  id: string;
  name: string;
  description: string;
  groups: FormGroup[];
  geofence?: GeofenceArea;
  settings: {
    allowAnonymous: boolean;
    requireLocation: boolean;
    offlineEnabled: boolean;
    autoSave: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export const QUESTION_TYPES: { type: QuestionType; label: string; icon: string; category: string }[] = [
  // Text inputs
  { type: "text", label: "Text", icon: "Type", category: "Text" },
  { type: "number", label: "Number", icon: "Hash", category: "Text" },
  { type: "note", label: "Note", icon: "StickyNote", category: "Text" },
  
  // Selection
  { type: "select_one", label: "Select One", icon: "CircleDot", category: "Choice" },
  { type: "select_multiple", label: "Select Multiple", icon: "CheckSquare", category: "Choice" },
  { type: "rank", label: "Ranking", icon: "ArrowUpDown", category: "Choice" },
  
  // Date/Time
  { type: "date", label: "Date", icon: "Calendar", category: "Date & Time" },
  { type: "time", label: "Time", icon: "Clock", category: "Date & Time" },
  { type: "datetime", label: "Date & Time", icon: "CalendarClock", category: "Date & Time" },
  
  // Location
  { type: "geopoint", label: "GPS Point", icon: "MapPin", category: "Location" },
  { type: "geotrace", label: "GPS Trace", icon: "Route", category: "Location" },
  { type: "geoshape", label: "GPS Shape", icon: "Hexagon", category: "Location" },
  
  // Media
  { type: "image", label: "Photo", icon: "Camera", category: "Media" },
  { type: "audio", label: "Audio", icon: "Mic", category: "Media" },
  { type: "video", label: "Video", icon: "Video", category: "Media" },
  { type: "file", label: "File Upload", icon: "Paperclip", category: "Media" },
  
  // Advanced
  { type: "barcode", label: "Barcode/QR", icon: "QrCode", category: "Advanced" },
  { type: "calculate", label: "Calculate", icon: "Calculator", category: "Advanced" },
  { type: "range", label: "Range/Slider", icon: "Sliders", category: "Advanced" },
  { type: "signature", label: "Signature", icon: "PenTool", category: "Advanced" },
  { type: "acknowledge", label: "Acknowledge", icon: "ThumbsUp", category: "Advanced" },
  { type: "matrix", label: "Matrix", icon: "Table", category: "Advanced" },
];
