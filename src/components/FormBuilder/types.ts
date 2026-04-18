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
    /** Optional human-readable message shown when min/max/regex fails. */
    message?: string;
    /** Min/max date for date/datetime — accepts ISO string or "today"/"now". */
    minDate?: string;
    maxDate?: string;
    /** Min/max length for text questions. */
    minLength?: number;
    maxLength?: number;
    /** Min/max selections for select_multiple. */
    minSelections?: number;
    maxSelections?: number;
    /** Min GPS accuracy (meters) accepted for geopoint capture. */
    minAccuracyMeters?: number;
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

  // ===========================================================
  // Frontier-class settings — all OPTIONAL and backwards-compatible.
  // The FormFiller falls back to current behavior when unset.
  // ===========================================================

  /** Text inputs */
  text?: {
    /** "single" (default) or "multiline" textarea */
    multiline?: boolean;
    rows?: number;
    /** Built-in input mask preset */
    mask?: "none" | "phone" | "email" | "url" | "nin" | "bvn" | "credit_card" | "custom";
    /** Custom regex pattern (when mask = "custom"); also doubles as validation.regex */
    pattern?: string;
    placeholder?: string;
    autoCapitalize?: "off" | "sentences" | "words" | "characters";
    spellcheck?: boolean;
    /** Right-to-left for Arabic/Hebrew respondents. */
    rtl?: boolean;
  };

  /** Number inputs */
  number?: {
    /** "integer" disables decimals; "decimal" allows them. */
    kind?: "integer" | "decimal";
    decimalPlaces?: number;
    /** Suffix shown next to the input (e.g. "kg", "°C", "₦"). */
    unit?: string;
    /** Display thousands separators in the input echo. */
    thousandsSeparator?: boolean;
    /** Step for numeric increment buttons. */
    step?: number;
    /** Show ±  stepper buttons next to the input. */
    showStepper?: boolean;
  };

  /** Select / Rank inputs */
  choice?: {
    /** Show a search filter when option count is large. */
    searchable?: boolean;
    /** Randomize option order per respondent (research bias control). */
    randomize?: boolean;
    /** Add an "Other" option with free-text input. */
    allowOther?: boolean;
    otherLabel?: string;
    /** Min / max number of selectable options for select_multiple. */
    minSelections?: number;
    maxSelections?: number;
    /** Render as compact pills/chips instead of radio rows. */
    layout?: "list" | "grid" | "chips" | "dropdown";
    /** Allow respondents to add a brand-new option on the fly. */
    allowAddNew?: boolean;
  };

  /** Date / DateTime / Time inputs */
  dateSettings?: {
    /** Default value: "today", "now", "tomorrow", or ISO string. */
    defaultTo?: "today" | "now" | "yesterday" | "tomorrow" | string;
    /** Min / max date — accepts ISO string OR "today" / "now" */
    minDate?: string;
    maxDate?: string;
    /** Show estimated age beside the date when used for a DOB question. */
    showAgeFromDOB?: boolean;
    /** Calendar system for display (storage stays ISO Gregorian). */
    calendar?: "gregorian" | "hijri" | "ethiopian" | "buddhist";
    /** Force a specific timezone interpretation, e.g. "Africa/Lagos". */
    timezone?: string;
    /** Restrict to weekdays only. */
    weekdaysOnly?: boolean;
  };

  /** Geo (geopoint / geotrace / geoshape) inputs */
  geo?: {
    /** Required minimum accuracy in meters before save. */
    minAccuracyMeters?: number;
    /** Auto-retry capture if accuracy not met. */
    autoRetry?: boolean;
    maxRetries?: number;
    /** Capture altitude alongside lat/lng. */
    captureAltitude?: boolean;
    /** Capture device heading/bearing alongside position. */
    captureHeading?: boolean;
    /** Cache offline base map tiles for this question's area. */
    offlineTiles?: boolean;
    /** Map style hint for the picker. */
    mapStyle?: "streets" | "satellite" | "terrain" | "hybrid";
  };

  /** Media (image / audio / video / file) inputs */
  media?: {
    /** Max number of items (for multi-shot photo galleries). */
    maxCount?: number;
    /** Image: target longest-edge in pixels for compression. */
    maxResolutionPx?: number;
    /** Image: JPEG quality 0–1. */
    quality?: number;
    /** Audio/Video: max duration in seconds. */
    maxDurationSec?: number;
    /** Burn GPS / timestamp watermark into image. */
    watermark?: boolean;
    /** Strip EXIF on save (privacy). */
    stripExif?: boolean;
    /** Force camera rather than gallery upload. */
    cameraOnly?: boolean;
    /** Front camera (e.g. selfie attestation) instead of rear. */
    frontCamera?: boolean;
    /** Allowed MIME types for the file picker. */
    accept?: string;
  };

  /** Signature inputs */
  signature?: {
    penColor?: string; // HSL/hex
    penWidth?: number; // px
    backgroundColor?: string;
    /** Require the signer's printed name alongside the drawing. */
    requirePrintedName?: boolean;
  };

  /** Range / Slider inputs */
  range?: {
    step?: number;
    showTicks?: boolean;
    showValueBubble?: boolean;
    /** Labels at min, mid, and max — e.g. "Poor / Fair / Excellent". */
    minLabel?: string;
    midLabel?: string;
    maxLabel?: string;
  };

  /** Matrix question */
  matrix?: {
    rows?: { id: string; label: string }[];
    columns?: { id: string; label: string; value: string }[];
    /** Single = radio per row, multiple = checkboxes per row. */
    cellInput?: "single" | "multiple" | "scale";
    /** Likert preset shortcut. */
    scale?: "likert5" | "likert7" | "satisfaction" | "agreement" | "frequency";
  };

  /** Rank input */
  rank?: {
    /** Show numeric stars instead of drag handles. */
    style?: "drag" | "stars" | "numbered";
    maxItems?: number;
  };

  /** Calculate */
  calc?: {
    /** Round to N decimal places when the result is numeric. */
    decimalPlaces?: number;
    /** Display the computed value to the respondent (read-only). */
    visible?: boolean;
  };

  /** Note */
  note?: {
    /** Render mode — plain, callout, warning, success. */
    style?: "plain" | "info" | "success" | "warning" | "danger";
    /** Allow markdown rendering. */
    markdown?: boolean;
  };

  /** Acknowledge */
  acknowledge?: {
    /** Text shown beside the checkbox; defaults to "I acknowledge". */
    statement?: string;
    /** Require user to scroll through hint before checkbox unlocks. */
    requireScroll?: boolean;
  };
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
