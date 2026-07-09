import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Question, GeofenceArea, FormGroup } from "@/components/FormBuilder/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Send,
  Save,
  MapPin,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle,
  Loader2,
  Briefcase,
  User,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  ClipboardCheck,
  Repeat,
  Folder,
  Plus,
  Ban,
  Mic,
  MicOff,
  FileText,
  HandMetal,
  Languages,
  Bug,
} from "lucide-react";
import SkipLogicDebugPanel from "@/components/FormFiller/SkipLogicDebugPanel";
import { toast } from "@/hooks/use-toast";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import {
  saveSavedEntry,
  newEntryId,
  buildSavedEntryDisplayName,
  type SavedFormEntry,
} from "@/lib/savedForms";
import { syncFinalizedSavedForms } from "@/lib/savedFormAutoSync";
import useGeolocation, { GeolocationPosition } from "@/hooks/useGeolocation";
import useGeofenceValidation from "@/hooks/useGeofenceValidation";
import { supabase } from "@/integrations/supabase/client";
import useCaseManagement, { CaseManagementSettings } from "@/hooks/useCaseManagement";
import GPSCapture from "./GPSCapture";
import DateInput from "./DateInput";
import PhotoCapture from "./PhotoCapture";
import SignatureCapture from "./SignatureCapture";
import AudioCapture from "./AudioCapture";
import BarcodeScanner from "./BarcodeScanner";
import CaseSelector from "./CaseSelector";
import VideoCapture from "./VideoCapture";
import BatteryOptimizationIndicator from "./BatteryOptimizationIndicator";
import AuthConfidenceMeter from "./AuthConfidenceMeter";
import FormNote from "./FormNote";

import { useStationaryGeofence } from "@/hooks/useStationaryGeofence";
import { useContinuousAuth } from "@/hooks/useContinuousAuth";
import { useFormTracking } from "@/hooks/useFormTracking";
import { useAudioVerification } from "@/hooks/useAudioVerification";
import { usePhotoMetadata } from "@/hooks/usePhotoMetadata";
import { useVoiceDataEntry } from "@/hooks/useVoiceDataEntry";
import { useTheme } from "next-themes";
import { normalizeFormTheme, buildFormThemeStyle } from "@/lib/formTheme";
import { useFormTTS } from "@/hooks/useFormTTS";
import { useVoiceCommands } from "@/hooks/useVoiceCommands";
import { useVoiceFormEngine, VoiceQuestion } from "@/hooks/useVoiceFormEngine";
import { useConversationalSLM } from "@/hooks/useConversationalSLM";
import { useOfflineWhisper, type WhisperLanguage } from "@/hooks/useOfflineWhisper";
import * as cloudSTT from "@/lib/speech/cloudSTT";
import { buildFormLexicon } from "@/lib/speech/lexiconBoost";
import {
  whisperToScribe,
  isLowResourceWhisper,
  shouldPreferOnDeviceWhisper,
} from "@/lib/speech/sttRouter";
import { VoiceFormOverlay } from "./VoiceFormOverlay";
import TextToSpeechPrompt from "./TextToSpeechPrompt";
import ConversationalVoiceDialog, { VoiceModeChoice } from "./ConversationalVoiceDialog";
import OfflineWhisperDialog from "./OfflineWhisperDialog";
import { isSensitiveQuestion } from "@/lib/speech/piiRouter";
import { recordUtterance } from "@/lib/speech/telemetry";
import { DeafAccessibleFormFiller } from "@/components/InclusiveCommunication";
import ThankYouDialog from "@/components/ThankYouDialog";
import { useNavigate } from "react-router-dom";
import fgnEmblem from "@/assets/fgn-emblem.png";
import {
  MdaChecklistSidebar,
  MdaQuickActions,
  MdaReminder,
} from "@/components/MdaChecklist/MdaChecklistChrome";
import { MdaLocationCascade } from "@/components/MdaChecklist";
import TreatmentToolWizard, { type TreatmentTool } from "./TreatmentToolWizard";
import { useAuth } from "@/hooks/useAuth";
import { MoEExpertProvider } from "./MoEExpertProvider";
import { ExpertFieldValidator } from "./ExpertFieldValidator";
// LocationGate / LocationHeaderBar intentionally NOT imported — location
// capture runs silently in the background only.
import { useLocationEnforcement, ACCURACY_HARD_LIMIT } from "@/hooks/useLocationEnforcement";
import type { FieldContext } from "@/hooks/useMoEExperts";
import { scrollToAppTop } from "@/lib/scrollToAppTop";
import {
  ACTIVE_FORM_FILL_KEY,
  SILENT_UPDATE_RESTORE_KEY,
  getFormDraftKey,
  hasMeaningfulFormResponses,
} from "@/lib/formProgressPersistence";
import { isMdaChecklistLike } from "@/lib/mdaFollowUp";
import { buildCesLocationUrl } from "@/lib/mda/cesLocationBridge";
import RepeatHouseholdCoverageSurvey from "@/components/HouseholdCoverageSurvey/RepeatHouseholdCoverageSurvey";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

// Removed TtsQuestionReader — sequential reading is now handled by useFormTTS.speakFromIndex

// Geography question names that the MDA checklist drives from the microplan
// via <MdaLocationCascade>. These are suppressed from normal rendering and
// populated by the cascade instead, so they can never be free-typed.
const MDA_GEO_NAMES = new Set([
  "state", "lga", "ward",
  "flhf", "flhf_name",
  "community", "community_name",
  "settlement", "settlement_name",
]);

// ---------------------------------------------------------------------------
// Skip-logic (XLSForm `relevant`) parse cache.
//
// Parsing a `relevant` expression with regexes is pure work that only depends
// on the expression string, never on the live answers. On large forms the same
// expressions are evaluated on every keystroke for every visible question, so
// we parse each expression once and memoise the structured result (and the set
// of question references it depends on). Evaluation then becomes a cheap value
// comparison and visibility recomputes only when a *referenced* answer changes.
// ---------------------------------------------------------------------------
type ParsedCondition =
  | { kind: "always" }
  | { kind: "selected"; ref: string; value: string; negate: boolean }
  | { kind: "eq"; ref: string; op: "=" | "!="; value: string }
  | { kind: "num"; ref: string; op: ">" | ">=" | "<" | "<="; num: number }
  | { kind: "truthy"; ref: string }
  | { kind: "passthrough" };

interface ParsedRelevant {
  /** Disjunction of conjunctions: OR over AND-groups of single conditions. */
  groups: ParsedCondition[][];
  /** XLSForm `name`/id references this expression depends on. */
  refs: string[];
}

const relevantParseCache = new Map<string, ParsedRelevant>();

const parseSingleRelevantCondition = (expr: string): ParsedCondition => {
  const trimmed = expr.trim().replace(/^\(/, "").replace(/\)$/, "").trim();
  if (!trimmed) return { kind: "always" };

  // not(selected(${name}, 'value')) — checked before selected() so the wrapping
  // negation is honoured instead of matching the inner selected() substring.
  const notSelectedMatch = trimmed.match(
    /not\s*\(\s*selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)\s*\)/,
  );
  if (notSelectedMatch) {
    return { kind: "selected", ref: notSelectedMatch[1], value: notSelectedMatch[2], negate: true };
  }

  const selectedMatch = trimmed.match(/selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)/);
  if (selectedMatch) {
    return { kind: "selected", ref: selectedMatch[1], value: selectedMatch[2], negate: false };
  }

  const eqMatch = trimmed.match(/\$\{(.+?)\}\s*(=|!=)\s*['"](.+?)['"]/);
  if (eqMatch) {
    return { kind: "eq", ref: eqMatch[1], op: eqMatch[2] as "=" | "!=", value: eqMatch[3] };
  }

  const numMatch = trimmed.match(/\$\{(.+?)\}\s*(>=?|<=?)\s*(-?\d+(?:\.\d+)?)/);
  if (numMatch) {
    return {
      kind: "num",
      ref: numMatch[1],
      op: numMatch[2] as ">" | ">=" | "<" | "<=",
      num: parseFloat(numMatch[3]),
    };
  }

  const truthyMatch = trimmed.match(/^\$\{(.+?)\}$/);
  if (truthyMatch) {
    return { kind: "truthy", ref: truthyMatch[1] };
  }

  return { kind: "passthrough" };
};

const parseRelevant = (relevant: string): ParsedRelevant => {
  const cached = relevantParseCache.get(relevant);
  if (cached) return cached;

  const expr = relevant.trim();
  const refs = new Set<string>();
  const collect = (c: ParsedCondition) => {
    if ("ref" in c) refs.add(c.ref);
  };

  // OR over AND-groups (disjunctive normal form), mirroring shouldShowQuestion.
  const groups: ParsedCondition[][] = expr
    .split(/\s+or\s+/i)
    .map((orPart) =>
      orPart.split(/\s+and\s+/i).map((andPart) => {
        const parsed = parseSingleRelevantCondition(andPart);
        collect(parsed);
        return parsed;
      }),
    );

  const result: ParsedRelevant = { groups, refs: [...refs] };
  relevantParseCache.set(relevant, result);
  return result;
};

interface FormSettings {
  allowAnonymous?: boolean;
  requireLocation?: boolean;
  offlineEnabled?: boolean;
  autoSave?: boolean;
  enforceGeofence?: boolean;
  autoSaveInterval?: number;
  /** Admin opted-in to in-app SLM conversational voice mode for this form. */
  conversationalVoice?: boolean;
  caseManagement?: CaseManagementSettings;
  /** Per-form GPS accuracy warning threshold (metres). Warning-only — never blocks submission. */
  gpsAccuracyWarningM?: number;
  /** Flags this form as the Integrated MDA Supervisory Checklist (FGN-branded experience). */
  isMdaChecklist?: boolean;
  /** When true, offer the linked Coverage Evaluation Survey (3D) after submission. */
  coverageEvaluation?: boolean;
  /** When true, launch the Repeat Household Coverage Survey after an MDA checklist is submitted. */
  householdSurvey?: boolean;
  /** Admin-set number of households the field user must sample & interview. */
  householdSampleSize?: number;
  /**
   * When true, the State → LGA → Ward → FLHF → Community → Settlement geography
   * questions are driven by the microplan via <MdaLocationCascade>, including
   * the "received medicine but not in the microplan" provision. Used by the
   * Treatment Data Reporting Tools (Community Summary Form & Treatment Register).
   */
  microplanLocationCascade?: boolean;
  /** Optional admin-defined state scope for the microplan cascade. */
  mdaStateScope?: string[];
}

interface FormFillerProps {
  formId: string;
  formName: string;
  formDescription: string;
  questions: Question[];
  groups?: FormGroup[];
  geofence?: GeofenceArea;
  userId: string;
  projectId: string;
  requireLocation?: boolean;
  settings?: FormSettings;
  initialCase?: { id: string; name: string; properties: Record<string, unknown> };
  onClose: () => void;
  onSubmitSuccess?: (submissionId: string) => void;
  /**
   * When true, the bottom of the form shows "Save Form As Draft" and
   * "Finalize Form" buttons that persist the entry locally (draft -> finalized)
   * instead of submitting directly to the server. Sending happens later from
   * the "Send Finalized" quick action.
   */
  localWorkflow?: boolean;
  /** An existing locally-saved entry being edited (Edit Saved Forms flow). */
  savedEntry?: SavedFormEntry | null;
  /** Called after a local draft/finalize save so the caller can close/refresh. */
  onSavedLocally?: () => void;
  /**
   * Preview mode (Form Builder). Renders the form with full ODK/Kobo fidelity
   * (groups, repeats, skip logic, validation, calculations, every question
   * type) but performs NO side effects: no database writes, no location
   * enforcement, no tracking. Submitting validates and shows a preview toast.
   */
  previewMode?: boolean;
  /**
   * When provided, only the form groups whose `name` is included here are
   * rendered. Used by the MDA Checklist landing page to open a single
   * follow-up sub-form (e.g. "Follow-up on MDA Completion") while keeping the
   * fields permanently part of the same "Community Checklist" form schema.
   */
  focusGroupNames?: string[];
  /**
   * Seed values applied once on mount (e.g. locked location prefilled from a
   * selected community on the MDA Checklist follow-up flows). User edits still
   * override these afterwards.
   */
  initialResponses?: Record<string, any>;
}

const FormFiller = ({
  formId,
  formName,
  formDescription,
  questions,
  groups: groupsProp = [],
  geofence,
  userId,
  projectId,
  requireLocation = false,
  settings = {},
  initialCase,
  onClose,
  onSubmitSuccess,
  localWorkflow = false,
  savedEntry = null,
  onSavedLocally,
  previewMode = false,
  focusGroupNames,
  initialResponses,
}: FormFillerProps) => {
  // Custom form theme (layout + light/dark colours) configured in the builder.
  const { resolvedTheme } = useTheme();
  const formTheme = useMemo(() => normalizeFormTheme((settings as any)?.theme), [settings]);
  const formThemeStyle = useMemo(
    () => buildFormThemeStyle(formTheme, resolvedTheme === "dark"),
    [formTheme, resolvedTheme],
  );
  // Case-management registration forms (CommCare-style) show ONLY the
  // registration questions (top-level/ungrouped). The follow-up question
  // groups are surfaced separately as their own beautiful modules and are not
  // part of the registration fill session.
  const isRegistrationForm =
    !!settings.caseManagement?.enabled && settings.caseManagement.action === "register";
  // Follow-up forms (update/close on an existing case) get a richer, flowery
  // multi-colour canvas to make longitudinal data collection delightful.
  const isFollowUpForm =
    !!settings.caseManagement?.enabled &&
    (settings.caseManagement.action === "update" || settings.caseManagement.action === "close");
  const followUpGroups = groupsProp;
  const focusedGroupsProp = useMemo(() => {
    if (!focusGroupNames || focusGroupNames.length === 0) return groupsProp;
    const wanted = new Set(focusGroupNames);
    // Match by group name slug OR label so renamed/saved schemas still resolve.
    const filtered = groupsProp.filter((g) => wanted.has(g.name) || wanted.has(g.label));
    // IMPORTANT: never fall back to the full Community Checklist. A focused
    // sub-form must show ONLY its own group's fields (or nothing if the admin
    // has not built any questions yet), not the checklist questions.
    return filtered;
  }, [groupsProp, focusGroupNames]);

  const groups = isRegistrationForm ? [] : focusedGroupsProp;

  const [responses, setResponses] = useState<Record<string, any>>({});
  const localEntryIdRef = useRef(savedEntry?.id || newEntryId());
  const [gpsPosition, setGpsPosition] = useState<GeolocationPosition | null>(null);
  const [backgroundLocation, setBackgroundLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [showCaseSelector, setShowCaseSelector] = useState(false);
  const [userGeofence, setUserGeofence] = useState<any>(undefined);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  // Always start repeat groups at 1 iteration — user adds more with "+"
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    groups.forEach(g => {
      if (g.repeat) counts[g.id] = 1;
    });
    return counts;
  });
  const [incompleteRepeatReasons, setIncompleteRepeatReasons] = useState<Record<string, string>>({});
  const [showRepeatReasonFor, setShowRepeatReasonFor] = useState<string | null>(null);
  const [userGeofenceLoaded, setUserGeofenceLoaded] = useState(false);
  // Mixture-of-Experts (math/language/validation) per-field blur triggers.
  // Each entry is incremented onBlur so the inline validator re-runs.
  const [expertTriggers, setExpertTriggers] = useState<Record<string, number>>({});
  const bumpExpertTrigger = useCallback((qKey: string) => {
    setExpertTriggers(prev => ({ ...prev, [qKey]: (prev[qKey] || 0) + 1 }));
  }, []);
  /**
   * Build the FieldContext payload for the inline MoE validator.
   * Includes up to 6 sibling answers so the math expert can spot crowd-out
   * cases like "1500 people in 1 house" by comparing against household size.
   */
  const buildExpertContext = useCallback((question: Question, qKey: string): FieldContext => {
    const siblings = Object.entries(responses)
      .filter(([k]) => k !== qKey && responses[k] !== undefined && responses[k] !== "")
      .slice(0, 6)
      .map(([k, v]) => ({ label: k, value: v }));
    return {
      type: question.type,
      label: question.label,
      value: responses[qKey],
      min: question.validation?.min,
      max: question.validation?.max,
      required: question.required,
      pattern: question.validation?.regex,
      options: question.options?.map(o => ({ value: o.value, label: o.label })),
      siblings,
    };
  }, [responses]);
  // Confirm dialog for submitting with incomplete iterations
  const [showIncompleteConfirm, setShowIncompleteConfirm] = useState(false);
  // Field challenge notes
  const [fieldNotes, setFieldNotes] = useState("");
  const [showFieldNotes, setShowFieldNotes] = useState(false);
  // Per-form TTS preference is stored in localStorage. The global "Read Forms
  // Aloud" setting (app_settings.ttsReadAloud) acts as the default; a per-form
  // speaker toggle in the header overrides it for that form and is remembered.
  const ttsPrefKey = formId ? `tts_form_pref_${formId}` : "tts_form_pref_global";
  const readGlobalTTS = () => {
    try {
      return JSON.parse(localStorage.getItem("app_settings") || "{}").ttsReadAloud === true;
    } catch {
      return false;
    }
  };
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    try {
      const perForm = localStorage.getItem(ttsPrefKey);
      if (perForm !== null) return perForm === "1";
    } catch { /* noop */ }
    return readGlobalTTS();
  });
  const [showTTSPrompt, setShowTTSPrompt] = useState(false);
  // Sync TTS with the global "Read Forms Aloud" setting live.
  useEffect(() => {
    const sync = () => setTtsEnabled(readGlobalTTS());
    window.addEventListener("app-settings-changed", sync);
    return () => window.removeEventListener("app-settings-changed", sync);
  }, [ttsPrefKey]);
  const [inclusiveMode, setInclusiveMode] = useState(false);


  // Conversational voice (in-app SLM) state
  const [showConversationalDialog, setShowConversationalDialog] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceModeChoice>("field_by_field");
  const [conversationalProcessing, setConversationalProcessing] = useState(false);
  const slm = useConversationalSLM();
  // Offline Whisper STT — replaces Web Speech for multilingual offline use.
  const [showWhisperDialog, setShowWhisperDialog] = useState(false);
  const [whisperLanguage, setWhisperLanguage] = useState<WhisperLanguage>(
    () => (typeof localStorage !== "undefined" && (localStorage.getItem("whisperLang") as WhisperLanguage)) || "en",
  );
  const [whisperEnabled, setWhisperEnabled] = useState(false);
  const whisper = useOfflineWhisper({ size: "small" });

  // Batch 10: auto-load on-device Whisper when the active language is
  // low-resource (HA/YO/IG). Scribe accuracy on these is poor, so we
  // silently kick off the ~250MB one-time download and toast the user.
  // While the model loads, the externalTranscriber falls through to
  // Scribe with the correct ISO 639-3 hint, then upgrades on next utterance.
  const autoWhisperRef = useRef(false);
  // Batch 11 PII routing: refs are read inside the externalTranscriber
  // closure, so we don't need to rebuild it whenever the active question
  // changes — refs always see the latest value.
  const sensitiveActiveRef = useRef(false);
  const sensitiveQIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ttsEnabled) return;
    if (!isLowResourceWhisper(whisperLanguage)) return;
    if (whisper.status !== "idle" || autoWhisperRef.current) return;
    if (!whisper.isSupported) return;
    autoWhisperRef.current = true;
    toast({
      title: "Preparing offline speech",
      description: `Downloading a one-time ${whisperLanguage.toUpperCase()} model (~250 MB) for accurate local-language input. Cloud STT is used until ready.`,
    });
    whisper.loadModel().then(() => setWhisperEnabled(true)).catch(() => {
      autoWhisperRef.current = false;
    });
  }, [ttsEnabled, whisperLanguage, whisper.status, whisper.isSupported, whisper.loadModel]);
  // Resume-from-crash state
  const [pendingDraft, setPendingDraft] = useState<{ responses: Record<string, any>; gpsPosition: any; savedAt: string } | null>(null);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  // Thank you state
  const [showThankYou, setShowThankYou] = useState(false);
  const [showCoverageOptIn, setShowCoverageOptIn] = useState(false);
  // Repeat Household Coverage Survey launch context (replaces the old 3D flow).
  const [householdSurveyCtx, setHouseholdSurveyCtx] = useState<null | {
    submissionId: string;
    target: number;
    location: { state?: string; lga?: string; ward?: string; flhf_name?: string; community_name?: string; settlement_name?: string };
    gps: { lat: number; lng: number; accuracy?: number } | null;
  }>(null);
  const navigate = useNavigate();
  // Integrated MDA Supervisory Checklist branded experience + Coverage Evaluation linkage.
  // Also detect by name so older/offline saved copies that missed the settings
  // flag still use the MDA chrome and never render the generic duplicate header.
  const normalizedFormName = (formName || "").toLowerCase();
  // SARMAAN Integrated Supervisory Checklist reuses the exact ODK-style MDA
  // chrome + microplan location cascade (State → LGA → Ward → FLHF → Community
  // → Settlement) so its sections render under the same beautiful interface.
  const isSupervisoryChecklist =
    !!(settings as any)?.supervisoryChecklistStyle ||
    !!(settings as any)?.sarmaan_supervisory ||
    (settings as any)?.presetKey === "supervisory_learning";
  const isMdaChecklist =
    isMdaChecklistLike({ settings, formName, groups: groupsProp }) || isSupervisoryChecklist;
  // Coverage Evaluation linkage is MDA-only; the supervisory checklist opts out.
  const offerCoverageEvaluation =
    isMdaChecklist && !isSupervisoryChecklist && !!settings.coverageEvaluation && !previewMode;
  // Repeat Household Coverage Survey — available on any MDA/supervisory checklist
  // whose admin enabled it and set a household sample size.
  const offerHouseholdSurvey =
    isMdaChecklist && !!(settings as any).householdSurvey && !previewMode;

  // Treatment Data Reporting Tools drive their geography from the microplan via
  // <MdaLocationCascade> (with the off-microplan provision), without the full
  // MDA branded/paginated experience.
  const useMicroplanCascade = !isMdaChecklist && !!(settings as any).microplanLocationCascade;
  // Treatment Data Reporting Tools render as dedicated, app-native multi-step
  // wizards (Community Summary Form / Community Treatment Register) instead of
  // the generic form renderer — detected by settings flag or form name.
  const detectedTreatmentTool: TreatmentTool | null = (() => {
    const t = (settings as any).treatmentTool as TreatmentTool | undefined;
    if (t === "community_summary" || t === "community_treatment_register") return t;
    if (normalizedFormName.includes("treatment register")) return "community_treatment_register";
    if (normalizedFormName.includes("summary form")) return "community_summary";
    return null;
  })();
  const isTreatmentTool = !previewMode && !isMdaChecklist && !isRegistrationForm && !!detectedTreatmentTool;
  // Active section index for the MDA Supervisory Checklist paginated experience.
  const [mdaActiveIndex, setMdaActiveIndex] = useState(0);
  // Stable navigation handler — instant scroll + single state update so the
  // section nav / Prev / Next buttons feel immediate (no smooth-scroll lag).
  const goToMdaSection = useCallback((i: number) => {
    setMdaActiveIndex(i);
    // Scroll the actual scroll container (the fixed MDA wrapper) to top instantly.
    scrollToAppTop("auto");
  }, []);

  useEffect(() => {
    scrollToAppTop("auto");
  }, [formId, previewMode]);
  // Map of question `name` -> id, used by the MDA summary cards.
  const mdaNameToId = useMemo(() => {
    const map: Record<string, string> = {};
    groups.forEach((g) => g.questions.forEach((qq) => { if (qq.name) map[qq.name] = qq.id; }));
    questions.forEach((qq) => { if (qq.name) map[qq.name] = qq.id; });
    return map;
  }, [groups, questions]);
  // Field metadata (name/label/type) so the MDA summary can adapt to edits:
  // drop cards whose source field was removed/retyped and auto-discover other
  // numeric fields to keep the summary insightful.
  const mdaFields = useMemo(() => {
    const out: { name: string; label: string; type: string }[] = [];
    const push = (qq: { name?: string; label?: string; type?: string }) => {
      if (qq.name) out.push({ name: qq.name, label: qq.label || qq.name, type: String(qq.type || "") });
    };
    groups.forEach((g) => g.questions.forEach(push));
    questions.forEach(push);
    return out;
  }, [groups, questions]);
  const [lastSubmissionOffline, setLastSubmissionOffline] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Snapshot of the last persisted (or initial) responses, used to detect
  // unsaved changes when the user attempts to leave the form.
  const savedSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (savedSnapshotRef.current === null) {
      savedSnapshotRef.current = JSON.stringify(responses);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses]);

  const markResponsesSaved = useCallback(() => {
    savedSnapshotRef.current = JSON.stringify(responses);
  }, [responses]);

  const hasUnsavedChanges = useCallback(() => {
    // If the user never actually touched an input, anything in `responses`
    // came from auto-computed (calculate) fields or pre-fills — leaving is safe
    // and the back button must exit instantly without a confirmation prompt.
    if (!userInteractedRef.current) return false;
    const hasReal = Object.entries(responses).some(
      ([k, v]) =>
        !k.startsWith("_") &&
        v !== undefined &&
        v !== null &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    );
    return hasReal && savedSnapshotRef.current !== JSON.stringify(responses);
  }, [responses]);

  const handleCloseAttempt = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowLeaveConfirm(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  const handleMdaExit = useCallback(() => {
    if (userInteractedRef.current && Object.keys(responses).length > 0) {
      try {
        localStorage.setItem(
          getFormDraftKey(formId),
          JSON.stringify({ formId, responses, gpsPosition, savedAt: new Date().toISOString(), userEntered: true }),
        );
      } catch {
        // Storage failures must never trap a supervisor inside the checklist.
      }
    }
    setShowLeaveConfirm(false);
    onClose();
  }, [formId, gpsPosition, onClose, responses]);

  const { isOnline, pendingCount, saveSubmission } = useOfflineStorage();
  const { profile, isAdmin } = useAuth();
  const [showSkipDebug, setShowSkipDebug] = useState(false);

  // Form tracking hooks
  const tracking = useFormTracking({ formId, userId });
  // In preview mode tracking must not write to the database. No-op the writers.
  const trackValidationFailure = previewMode ? () => {} : tracking.trackValidationFailure;
  const updateVisibleQuestions = previewMode ? () => {} : tracking.updateVisibleQuestions;
  const saveTrackingData = previewMode ? (async () => {}) : tracking.saveTrackingData;
  const { isRecording, audioClipUrl, startRecording, stopRecording } = useAudioVerification({ formId, userId, formName: formName });
  const { captureMetadata } = usePhotoMetadata(formId, userId);
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);
  const [voiceTriggers, setVoiceTriggers] = useState<Record<string, string>>({});
  // Per-numeric-question historical baselines for outlier detection.
  // Computed from past form_submissions when voice mode activates.
  const [numericBaselines, setNumericBaselines] = useState<Record<string, { mean: number; std: number; count: number }>>({});

  // Callback to get current response for a question (used by TTS confirmation flow)
  const getResponseForTTS = useCallback((questionId: string) => {
    return responses[questionId];
  }, [responses]);

  const {
    speakQuestion, speakFromIndex, speakFromQuestion, speak, stop: stopTTS,
    isSpeaking, buildQuestionText, awaitingConfirmation, currentQuestionId,
    confirmAndAdvance, processNavigationCommand,
  } = useFormTTS({
    enabled: ttsEnabled,
    getResponse: getResponseForTTS,
    onAwaitingConfirmation: (qId) => {
      // Auto-activate mic for voice input when TTS finishes reading a question
      setActiveVoiceField(qId);
    },
    onQuestionAdvanced: (qId) => {
      setActiveVoiceField(qId);
    },
  });

  const { isListening, isEnabled: voiceEnabled, isSupported: voiceSupported, interimTranscript, startListening, stopListening } = useVoiceDataEntry({
    onResult: (text, isFinal) => {
      if (!isFinal) return;
      // When the Voice Form Engine is active, it manages its own mic — ignore results here
      if (voiceEngine.isActive) return;
      
      // First check for navigation commands (next, continue, skip, repeat)
      if (ttsEnabled && processNavigationCommand(text)) {
        return; // Handled as navigation
      }
      
      if (activeVoiceField) {
        const handled = voiceCommands.processVoiceInput(text, activeVoiceField);
        if (!handled) {
          // Fallback: set the text directly as the response
          userInteractedRef.current = true;
          setResponses(prev => ({ ...prev, [activeVoiceField]: text.trim() }));
          if (ttsEnabled) speak(`Got it. "${text.trim()}"`, true);
        }
      }
    },
  });

  // Voice commands for all question types — actually update form state
  const voiceCommands = useVoiceCommands({
    enabled: ttsEnabled || voiceEnabled,
    onSelectOption: (qId, val) => {
      userInteractedRef.current = true;
      setResponses(prev => ({ ...prev, [qId]: val }));
      if (validationErrors[qId]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qId]; return u; });
      }
      toast({ title: "Voice selection", description: `Selected: ${val}` });
      if (ttsEnabled) speak(`Selected ${val}.`, true);
    },
    onDeselectOption: (qId, val) => {
      userInteractedRef.current = true;
      setResponses(prev => {
        const current = prev[qId];
        if (Array.isArray(current)) return { ...prev, [qId]: current.filter((v: string) => v !== val) };
        return { ...prev, [qId]: undefined };
      });
      if (ttsEnabled) speak(`Removed ${val}.`, true);
    },
    onTextInput: (qId, text) => {
      userInteractedRef.current = true;
      setResponses(prev => ({ ...prev, [qId]: text.trim() }));
      if (validationErrors[qId]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qId]; return u; });
      }
      if (ttsEnabled) speak(`Entered: "${text.trim()}"`, true);
    },
    onNumberInput: (qId, val) => {
      userInteractedRef.current = true;
      setResponses(prev => ({ ...prev, [qId]: val }));
      if (validationErrors[qId]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qId]; return u; });
      }
      if (ttsEnabled) speak(`Number ${val} entered.`, true);
    },
    onDateInput: (qId, val) => {
      userInteractedRef.current = true;
      setResponses(prev => ({ ...prev, [qId]: val }));
      if (validationErrors[qId]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qId]; return u; });
      }
      if (ttsEnabled) speak(`Date set to ${val}.`, true);
    },
    onTimeInput: (qId, val) => {
      userInteractedRef.current = true;
      setResponses(prev => ({ ...prev, [qId]: val }));
      if (validationErrors[qId]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qId]; return u; });
      }
      if (ttsEnabled) speak(`Time set to ${val}.`, true);
    },
    onBooleanInput: (qId, val) => {
      userInteractedRef.current = true;
      setResponses(prev => ({ ...prev, [qId]: val }));
      if (validationErrors[qId]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qId]; return u; });
      }
      if (ttsEnabled) speak(val ? "Yes." : "No.", true);
    },
    onTriggerAction: (qId, action) => {
      // Actually trigger the capture action
      setVoiceTriggers(prev => ({ ...prev, [qId]: action }));
      const actionLabels: Record<string, string> = {
        capture_gps: "Capturing your GPS location now.",
        take_photo: "Opening camera now.",
        record_audio: "Starting audio recording now.",
        record_video: "Starting video recording now.",
        scan_barcode: "Opening barcode scanner now.",
        acknowledge: "Acknowledged.",
      };
      if (action === "acknowledge") {
        setResponses(prev => ({ ...prev, [qId]: true }));
        if (validationErrors[qId]) {
          setValidationErrors(prev => { const u = { ...prev }; delete u[qId]; return u; });
        }
      }
      toast({ title: "Voice command", description: actionLabels[action] || `Triggered: ${action}` });
      if (ttsEnabled) speak(actionLabels[action] || `Triggered ${action}.`, true);
      // Clear trigger after a short delay so it can be re-triggered
      setTimeout(() => {
        setVoiceTriggers(prev => { const u = { ...prev }; delete u[qId]; return u; });
      }, 2000);
    },
  });

  // Register questions for voice commands
  useEffect(() => {
    const allQs = [...questions, ...groups.flatMap(g => g.questions)];
    allQs.forEach(q => {
      voiceCommands.registerQuestion({
        id: q.id,
        type: q.type,
        options: q.options?.map(o => ({ label: o.label, value: o.value })),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, groups]);

  // ─── Voice Form Engine (production-grade accessible voice mode) ──
  // Ref for deferred handleSubmit binding (avoids forward-reference issue)
  const handleSubmitRef = React.useRef<(() => void) | null>(null);

  // Tracks whether the respondent has actually entered any data. Used to avoid
  // persisting "empty" drafts that only contain pre-populated / computed values.
  const userInteractedRef = React.useRef(false);
  const markUserInput = React.useCallback(() => {
    userInteractedRef.current = true;
  }, []);

  // Scroll to (and visually flag) the missed required question nearest to the
  // user's current scroll position. Returns true if a target was found.
  const scrollToFirstError = React.useCallback((errs: Record<string, string>) => {
    const keys = Object.keys(errs).filter((k) => !k.startsWith("_"));
    if (keys.length === 0) {
      // Fall back to non-field errors (e.g. repeat reason / geofence)
      const otherEl = document.querySelector<HTMLElement>("[data-form-error]");
      otherEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      return !!otherEl;
    }
    const viewportCenter = window.scrollY + window.innerHeight / 2;
    let best: { el: HTMLElement; dist: number } | null = null;
    for (const k of keys) {
      const el = document.getElementById(`question-${k}`);
      if (!el) continue;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const dist = Math.abs(top - viewportCenter);
      if (!best || dist < best.dist) best = { el, dist };
    }
    if (best) {
      best.el.scrollIntoView({ behavior: "smooth", block: "center" });
      best.el.classList.add("animate-pulse");
      const focusable = best.el.querySelector<HTMLElement>(
        "input, textarea, select, [tabindex], button"
      );
      setTimeout(() => {
        try { focusable?.focus({ preventScroll: true }); } catch {}
        best!.el.classList.remove("animate-pulse");
      }, 1200);
      return true;
    }
    return false;
  }, []);

  const voiceFormQuestions = useMemo<VoiceQuestion[]>(() => {
    // Build a local name→id map so we don't depend on the later-defined nameToIdMap
    const localNameToId: Record<string, string> = {};
    const allQs = [...questions, ...groups.flatMap(g => g.questions)];
    allQs.forEach(q => { if (q.name) localNameToId[q.name] = q.id; });

    const checkVisible = (question: Question): boolean => {
      if (!question.relevant) return true;
      const expr = question.relevant;
      const selM = expr.match(/selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)/);
      if (selM) { const qId = localNameToId[selM[1]]; if (qId) { const v = responses[qId]; return Array.isArray(v) ? v.includes(selM[2]) : String(v || "") === selM[2]; } return false; }
      const eqM = expr.match(/\$\{(.+?)\}\s*(=|!=)\s*['"](.+?)['"]/);
      if (eqM) { const qId = localNameToId[eqM[1]]; if (qId) { const raw = responses[qId]; const matches = Array.isArray(raw) ? raw.map(String).includes(eqM[3]) : String(raw ?? "") === eqM[3]; return eqM[2] === "=" ? matches : !matches; } return eqM[2] === "!="; }
      const numM = expr.match(/\$\{(.+?)\}\s*(>=?|<=?)\s*(-?\d+(?:\.\d+)?)/);
      if (numM) { const qId = localNameToId[numM[1]]; if (qId) { const v = parseFloat(String(responses[qId] || "0")); const n = parseFloat(numM[3]); if (numM[2] === ">") return v > n; if (numM[2] === ">=") return v >= n; if (numM[2] === "<") return v < n; return v <= n; } return false; }
      const tM = expr.match(/^\$\{(.+?)\}$/);
      if (tM) { const qId = localNameToId[tM[1]]; if (qId) { const v = responses[qId]; return v !== undefined && v !== null && v !== "" && v !== false; } return false; }
      return true;
    };

    const vqs: VoiceQuestion[] = [];
    // Helper: extract numeric min/max from a Question (validation rules + ODK constraint)
    const numericRange = (q: Question): { min?: number; max?: number } => {
      const out: { min?: number; max?: number } = {};
      if (typeof q.validation?.min === "number") out.min = q.validation.min;
      if (typeof q.validation?.max === "number") out.max = q.validation.max;
      // ODK constraint like ". >= 0 and . <= 120"
      if (q.constraint) {
        const ge = q.constraint.match(/\.\s*>=\s*(-?\d+(?:\.\d+)?)/);
        const gt = q.constraint.match(/\.\s*>\s*(-?\d+(?:\.\d+)?)/);
        const le = q.constraint.match(/\.\s*<=\s*(-?\d+(?:\.\d+)?)/);
        const lt = q.constraint.match(/\.\s*<\s*(-?\d+(?:\.\d+)?)/);
        if (ge && out.min === undefined) out.min = parseFloat(ge[1]);
        if (gt && out.min === undefined) out.min = parseFloat(gt[1]) + Number.EPSILON;
        if (le && out.max === undefined) out.max = parseFloat(le[1]);
        if (lt && out.max === undefined) out.max = parseFloat(lt[1]) - Number.EPSILON;
      }
      return out;
    };

    // Groups (with iteration support — repeats expand to per-iteration questions)
    groups.forEach(g => {
      const iterations = g.repeat ? (repeatCounts[g.id] || 1) : 1;
      const vqGroupQuestions = g.questions.filter(q => checkVisible(q) && q.type !== "calculate" && q.type !== "note");
      for (let iterIdx = 0; iterIdx < iterations; iterIdx++) {
        vqGroupQuestions.forEach(q => {
          const qKey = iterations > 1 ? `${q.id}__${iterIdx}` : q.id;
          const labelPrefix = iterations > 1 || g.repeat ? `[${g.label} – iteration ${iterIdx + 1}] ` : "";
          const range = numericRange(q);
          vqs.push({
            id: qKey,
            label: labelPrefix + q.label,
            type: q.type,
            required: q.required,
            options: q.options?.map(o => ({ label: o.label, value: o.value })),
            hint: q.hint,
            groupId: g.id,
            iterationIndex: g.repeat ? iterIdx : undefined,
            min: range.min,
            max: range.max,
            baseline: numericBaselines[q.id] || (q.name ? numericBaselines[q.name] : undefined),
          });
        });
      }
    });
    // Ungrouped questions
    questions.filter(q => checkVisible(q) && q.type !== "calculate" && q.type !== "note").forEach(q => {
      if (!vqs.some(v => v.id === q.id)) {
        const range = numericRange(q);
        vqs.push({
          id: q.id, label: q.label, type: q.type, required: q.required,
          options: q.options?.map(o => ({ label: o.label, value: o.value })),
          hint: q.hint,
          min: range.min,
          max: range.max,
          baseline: numericBaselines[q.id] || (q.name ? numericBaselines[q.name] : undefined),
        });
      }
    });
    return vqs;
  }, [questions, groups, responses, repeatCounts, numericBaselines]);

  // Per-form lexicon for STT biasing (Batch 8): proper nouns from labels +
  // option labels become biased_keywords for Scribe and hot-words for
  // Web Speech. Recomputes only when the question set changes.
  const voiceLexicon = useMemo(() => buildFormLexicon(questions || []), [questions]);

  const [voiceInterimText, setVoiceInterimText] = useState<string>("");
  const [voiceFinalText, setVoiceFinalText] = useState<string>("");

  // Voice engine validator — populated later in a useEffect once all the
  // dependent state (geofence, GPS, etc.) is in scope. Using a ref breaks
  // the forward-reference cycle.
  const validatorRef = React.useRef<() => string[]>(() => []);

  const voiceEngine = useVoiceFormEngine({
    enabled: ttsEnabled,
    questions: voiceFormQuestions,
    lexicon: voiceLexicon,
    // After 2 failed voice attempts on a question, surface the input so
    // the user can tap/type instead. Engine keeps listening in parallel.
    onNeedsManualRepair: (qId) => {
      const baseId = qId.includes("__") ? qId.split("__")[0] : qId;
      const el = document.getElementById(`question-${qId}`) || document.getElementById(`question-${baseId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = el?.querySelector<HTMLElement>("input, textarea, [role='combobox'], [role='radiogroup']");
      try { input?.focus({ preventScroll: true }); } catch { /* noop */ }
      toast({
        title: "Trouble hearing you",
        description: "Tap the highlighted field to type your answer.",
      });
    },
    // STT tier order (Batch 4 + Batch 10 + Batch 11 PII routing):
    //   0. If the active question is sensitive (name, phone, NIN, GPS, …),
    //      NEVER ship audio to the cloud — force on-device Whisper, or
    //      fall through to the browser engine (which on Chrome/Android can
    //      use an on-device pack). This is non-negotiable PII hygiene.
    //   1. Otherwise: offline Whisper if user enabled it OR the active
    //      language is low-resource (HA/YO/IG) where Scribe quality is
    //      materially worse than Whisper-small.
    //   2. ElevenLabs Scribe v2 cloud STT with proper ISO 639-3 hint.
    //   3. (engine default) Web Speech API when nothing else is available.
    externalTranscriber: (() => {
      const useWhisper = (whisperEnabled || shouldPreferOnDeviceWhisper(whisperLanguage)) && whisper.isReady;
      const canCloud = typeof navigator !== "undefined" && navigator.onLine && !cloudSTT.isCloudSTTQuotaExhausted();

      if (useWhisper) {
        return async () => {
          const t0 = Date.now();
          const blob = await whisper.recordOnce({ ms: 7000 });
          const r = await whisper.transcribe(blob, { language: whisperLanguage });
          recordUtterance({
            tier: "whisper_local",
            latencyMs: Date.now() - t0,
            conf: r.confidence,
            lang: whisperLanguage,
            qId: sensitiveQIdRef.current || undefined,
            durationMs: r.durationMs,
          });
          if (!r.text) throw new Error("no_speech");
          return { text: r.text, confidence: r.confidence };
        };
      }

      if (!canCloud) return undefined;

      return async () => {
        // PII gate: if the active question is sensitive, refuse the cloud
        // entirely and let the engine fall back to the on-device browser SR.
        if (sensitiveActiveRef.current) {
          recordUtterance({
            tier: "scribe_cloud",
            latencyMs: 0,
            fallbackReason: "pii_blocked",
            qId: sensitiveQIdRef.current || undefined,
            lang: whisperToScribe(whisperLanguage),
          });
          throw new Error("no_speech");
        }
        try {
          return await cloudSTT.recordAndTranscribe({
            maxMs: 8000,
            language: whisperToScribe(whisperLanguage),
            qId: sensitiveQIdRef.current || undefined,
          });
        } catch (e: any) {
          const msg = e?.message || "";
          if (msg === "quota_exhausted" || msg === "network_error") {
            throw new Error("no_speech"); // soft fallback signal
          }
          throw e;
        }
      };
    })(),
    getResponse: (qId) => responses[qId],
    setResponse: (qId, val) => {
      setResponses(prev => ({ ...prev, [qId]: val }));
      if (validationErrors[qId]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qId]; return u; });
      }
    },
    clearResponse: (qId) => {
      setResponses(prev => { const u = { ...prev }; delete u[qId]; return u; });
    },
    onSubmitRequest: () => {
      handleSubmitRef.current?.();
    },
    onQuestionFocused: (qId) => {
      setActiveVoiceField(qId);
      // Strip iteration suffix to find the visible card
      const baseId = qId.includes("__") ? qId.split("__")[0] : qId;
      const el = document.getElementById(`question-${qId}`) || document.getElementById(`question-${baseId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Batch 11 PII routing: update sensitivity flag for externalTranscriber.
      const allQs = [...questions, ...groups.flatMap(g => g.questions)];
      const q = allQs.find(x => x.id === baseId);
      sensitiveActiveRef.current = isSensitiveQuestion(q);
      sensitiveQIdRef.current = qId;
    },
    onTriggerAction: (qId, action) => {
      setVoiceTriggers(prev => ({ ...prev, [qId]: action }));
      setTimeout(() => {
        setVoiceTriggers(prev => { const u = { ...prev }; delete u[qId]; return u; });
      }, 3000);
    },
    onInterimTranscript: (txt) => setVoiceInterimText(txt),
    onFinalTranscript: (txt) => {
      setVoiceFinalText(txt);
      setVoiceInterimText("");
      setTimeout(() => setVoiceFinalText(""), 2500);
    },
    onRepeatIterationComplete: (groupId) => {
      const g = groups.find(gg => gg.id === groupId);
      if (!g || !g.repeat) return false;
      const cur = repeatCounts[groupId] || 1;
      if (g.repeatCount && cur >= g.repeatCount) return false;
      setRepeatCounts(prev => ({ ...prev, [groupId]: (prev[groupId] || 1) + 1 }));
      return true;
    },
    onValidate: () => validatorRef.current(),
    onPerValueValidate: (qId, value, vq) => {
      // Only validate numeric / range values for now (range warnings + outliers).
      if (!["number", "integer", "decimal", "range"].includes(vq.type)) return null;
      const num = typeof value === "number" ? value : parseFloat(String(value));
      if (!isFinite(num)) return null;
      // 1) Hard min/max from form-builder validation rules / ODK constraint
      if (vq.min !== undefined && num < vq.min) {
        return {
          warning: `That sounds low. ${vq.label.replace(/<[^>]*>/g, "")} should be at least ${vq.min}.`,
          suggestion: vq.min,
        };
      }
      if (vq.max !== undefined && num > vq.max) {
        // Common voice mishearing: "150" instead of "15" → suggest /10
        const suggestion = num > vq.max && num / 10 >= (vq.min ?? 0) && num / 10 <= vq.max
          ? Math.round(num / 10)
          : vq.max;
        return {
          warning: `That sounds high. ${vq.label.replace(/<[^>]*>/g, "")} should be at most ${vq.max}.`,
          suggestion,
        };
      }
      // 2) Outlier detection from historical baseline (only when no min/max set)
      if (vq.min === undefined && vq.max === undefined && vq.baseline && vq.baseline.count >= 5) {
        const { mean, std } = vq.baseline;
        if (std > 0) {
          const z = Math.abs(num - mean) / std;
          if (z >= 3) {
            // Strong outlier — suggest dividing by 10 if it would land near the mean
            const tenth = num / 10;
            const suggestion = Math.abs(tenth - mean) / std < z ? Math.round(tenth) : Math.round(mean);
            return {
              warning: `That value is unusually ${num > mean ? "high" : "low"} compared to other submissions (typically around ${Math.round(mean)}).`,
              suggestion,
            };
          }
        }
      }
      return null;
    },
  });

  // ─── Fetch historical numeric baselines for outlier detection ──
  // Computed once when voice mode activates, scoped to this form.
  useEffect(() => {
    if (!ttsEnabled || !formId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("form_submissions")
          .select("data")
          .eq("form_id", formId)
          .in("status", ["finalized", "sent"])
          .order("created_at", { ascending: false })
          .limit(500);
        if (error || !data || cancelled) return;
        const allQs = [...questions, ...groups.flatMap(g => g.questions)];
        const numericQs = allQs.filter(q => ["number", "integer", "decimal", "range"].includes(q.type));
        const samples: Record<string, number[]> = {};
        for (const sub of data) {
          const d = (sub.data || {}) as Record<string, any>;
          for (const q of numericQs) {
            // Try by id, name, and lowercased label
            const candidates = [q.id, q.name, q.name?.toLowerCase()].filter(Boolean) as string[];
            for (const key of candidates) {
              const v = d[key];
              if (v !== undefined && v !== null && v !== "") {
                const n = parseFloat(String(v));
                if (isFinite(n)) {
                  (samples[q.id] ||= []).push(n);
                  if (q.name) (samples[q.name] ||= []).push(n);
                  break;
                }
              }
            }
          }
        }
        const baselines: Record<string, { mean: number; std: number; count: number }> = {};
        for (const [k, vals] of Object.entries(samples)) {
          if (vals.length < 5) continue;
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
          baselines[k] = { mean, std: Math.sqrt(variance), count: vals.length };
        }
        if (!cancelled && Object.keys(baselines).length > 0) {
          setNumericBaselines(baselines);
        }
      } catch {
        /* baselines are best-effort; never block voice mode */
      }
    })();
    return () => { cancelled = true; };
  }, [ttsEnabled, formId, questions, groups]);

  // Stop the basic voice data entry listener when the full Voice Form Engine takes over
  useEffect(() => {
    if (voiceEngine.isActive && isListening) {
      stopListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEngine.isActive]);

  // Auto-start mic when TTS is awaiting confirmation (voice input ready)
  // BUT only when the full Voice Form Engine is NOT active (it manages its own mic)
  useEffect(() => {
    if (ttsEnabled && awaitingConfirmation && voiceSupported && !isListening && !voiceEngine.isActive) {
      const timer = setTimeout(() => {
        startListening();
      }, 400);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingConfirmation, ttsEnabled, voiceEngine.isActive]);

  // Auto-start background audio recording when form opens
  useEffect(() => {
    const timer = setTimeout(() => {
      startRecording();
    }, 2000); // slight delay to let mic permission prompt appear naturally
    return () => {
      clearTimeout(timer);
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Fetch user-specific geofence assignment
  useEffect(() => {
    const fetchUserGeofence = async () => {
      try {
        const { data, error } = await supabase
          .from("user_geofence_assignments")
          .select("geofence")
          .eq("user_id", userId)
          .eq("form_id", formId)
          .maybeSingle();

        if (!error && data) {
          setUserGeofence(data.geofence);
        } else {
          setUserGeofence(null);
        }
      } catch (e) {
        console.error("Error fetching user geofence:", e);
        setUserGeofence(null);
      } finally {
        setUserGeofenceLoaded(true);
      }
    };
    fetchUserGeofence();
  }, [userId, formId]);

  // Background GPS auto-capture disabled by product decision:
  // Forms must NOT be blocked by missing background GPS. Explicit geopoint
  // questions still capture location when present; submissions otherwise
  // proceed without a silent fix.


  const effectiveGeofence = userGeofenceLoaded ? userGeofence : undefined;
  const { validatePosition, isGeofenceEnabled, normalizedGeofence } = useGeofenceValidation(effectiveGeofence);
  const { position: currentGpsPosition, getCurrentPosition, isLoading: isGpsLoading } = useGeolocation();

  // ============================================================
  // GLOBAL LOCATION ENFORCEMENT
  // Every form is gated by useLocationEnforcement: device location MUST be on,
  // a high-accuracy fix is captured silently, admin chain is reverse-geocoded
  // offline (State/LGA/Ward/Settlement), and the form blocks submission if
  // permission is revoked mid-form or accuracy is worse than ±100m.
  // ============================================================
  // Detect if the form has any GPS/geopoint question — when present the user's
  // captured point overrides auto_gps for downstream admin-level resolution.
  const hasGpsQuestion = useMemo(
    () => [...questions, ...groups.flatMap(g => g.questions)].some(q => q.type === "geopoint"),
    [questions, groups]
  );
  // Location enforcement only runs when the form has a GPS question.
  // Never runs in preview mode (no permission prompts, no side effects).
  const locEnforcement = useLocationEnforcement({ enabled: hasGpsQuestion && !previewMode });
  // Find first answered geopoint coordinate (used to update admin chain live).
  const gpsQuestionAnswer = useMemo(() => {
    if (!hasGpsQuestion) return null;
    const all = [...questions, ...groups.flatMap(g => g.questions)];
    for (const q of all) {
      if (q.type === "geopoint" && responses[q.id]) {
        const v = responses[q.id];
        if (v && typeof v === "object" && typeof v.lat === "number" && typeof v.lng === "number") {
          return { lat: v.lat, lng: v.lng, accuracy: v.accuracy };
        }
      }
    }
    return null;
  }, [hasGpsQuestion, questions, groups, responses]);

  // Re-resolve admin chain whenever the user (re)captures the GPS question.
  useEffect(() => {
    if (gpsQuestionAnswer) {
      locEnforcement.resolveFromQuestion(gpsQuestionAnswer.lat, gpsQuestionAnswer.lng);
    }
  }, [gpsQuestionAnswer?.lat, gpsQuestionAnswer?.lng]);

  useEffect(() => {
    if (currentGpsPosition) setGpsPosition(currentGpsPosition);
  }, [currentGpsPosition]);

  
  const {
    selectedCase,
    setSelectedCase,
    requiresCaseSelection,
    getPrePopulatedResponses,
    processCaseAction,
    loading: caseLoading,
  } = useCaseManagement(settings.caseManagement, userId, projectId);

  const effectiveRequireLocation = settings.requireLocation ?? requireLocation;
  const effectiveAutoSave = settings.autoSave ?? true;
  const effectiveEnforceGeofence = settings.enforceGeofence ?? isGeofenceEnabled ?? false;
  const autoSaveInterval = settings.autoSaveInterval ?? 30;
  const draftKey = useMemo(() => getFormDraftKey(formId), [formId]);

  const persistCurrentDraft = useCallback(() => {
    if (!effectiveAutoSave || !userInteractedRef.current || Object.keys(responses).length === 0) return false;
    if (!hasMeaningfulFormResponses(responses)) return false;
    try {
      const savedAt = new Date().toISOString();
      localStorage.setItem(draftKey, JSON.stringify({ formId, responses, gpsPosition, savedAt, userEntered: true }));
      localStorage.setItem(
        ACTIVE_FORM_FILL_KEY,
        JSON.stringify({ formId, projectId, savedAt, hasUserProgress: true, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }),
      );
      window.dispatchEvent(new Event("amehnities:form-progress-changed"));
      return true;
    } catch {
      return false;
    }
  }, [draftKey, effectiveAutoSave, formId, gpsPosition, projectId, responses]);

  // Stationary geofence for battery optimization
  const stationaryState = useStationaryGeofence({
    enabled: effectiveRequireLocation || !!isGeofenceEnabled,
  });

  // Continuous authentication
  const { posture: authPosture } = useContinuousAuth(true);

  useEffect(() => {
    if (initialCase && !selectedCase) {
      setSelectedCase(initialCase);
    }
  }, [initialCase]);

  useEffect(() => {
    if (requiresCaseSelection && !selectedCase && !initialCase) {
      setShowCaseSelector(true);
    }
  }, [requiresCaseSelection, selectedCase, initialCase]);

  useEffect(() => {
    if (selectedCase) {
      const prePopulated = getPrePopulatedResponses();
      if (Object.keys(prePopulated).length > 0) {
        setResponses((prev) => ({ ...prePopulated, ...prev }));
      }
    }
  }, [selectedCase, getPrePopulatedResponses]);

  useEffect(() => {
    if (effectiveRequireLocation && !gpsPosition) {
      getCurrentPosition();
    }
  }, [effectiveRequireLocation]);

  // Immediate (debounced) autosave on EVERY response change so a crash / battery
  // death never loses progress. Falls back to interval if autosave is disabled.
  useEffect(() => {
    // Never persist a draft until the respondent has actually entered something.
    // This prevents "empty" drafts created purely from pre-populated/computed values.
    if (!effectiveAutoSave || !userInteractedRef.current || Object.keys(responses).length === 0) return;
    const t = setTimeout(() => {
      if (persistCurrentDraft()) {
        setLastAutoSave(new Date());
      }
    }, 400); // debounce 400ms
    return () => clearTimeout(t);
  }, [effectiveAutoSave, responses, persistCurrentDraft]);

  // When editing an existing locally-saved entry, hydrate its responses and
  // skip the resume-from-crash prompt entirely.
  useEffect(() => {
    if (!savedEntry) return;
    userInteractedRef.current = true;
    setResponses(savedEntry.responses || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedEntry?.id]);

  // Seed prefilled (locked) values once on mount — e.g. location selected from a
  // community list on the MDA Checklist follow-up flows.
  const seededInitialRef = useRef(false);
  useEffect(() => {
    if (seededInitialRef.current) return;
    if (savedEntry) return;
    if (!initialResponses || Object.keys(initialResponses).length === 0) return;
    seededInitialRef.current = true;
    setResponses((prev) => ({ ...initialResponses, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResponses]);

  // On-mount: detect any saved draft and OFFER to resume (don't silently overwrite)
  useEffect(() => {
    if (savedEntry) return; // editing a saved entry — no crash-resume prompt
    const saved = localStorage.getItem(draftKey);
    if (!saved) return;
    try {
      const draft = JSON.parse(saved);
      const hasRealResponses = hasMeaningfulFormResponses(draft?.responses);
      // Only offer to resume genuine drafts (explicitly flagged as user-entered,
      // or — for legacy drafts — containing at least one real answer).
      if (hasRealResponses && (draft.userEntered === undefined || draft.userEntered === true)) {
        const silentRestore = (() => {
          try {
            const restore = JSON.parse(sessionStorage.getItem(SILENT_UPDATE_RESTORE_KEY) || "null");
            return restore?.formId === formId && restore?.draftKey === draftKey;
          } catch {
            return false;
          }
        })();
        if (silentRestore) {
          setResponses(draft.responses || {});
          if (draft.gpsPosition) setGpsPosition(draft.gpsPosition);
          userInteractedRef.current = true;
          sessionStorage.removeItem(SILENT_UPDATE_RESTORE_KEY);
        } else {
          setPendingDraft(draft);
          setShowResumeDialog(true);
        }
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch (e) {
      console.error("Failed to read draft:", e);
      localStorage.removeItem(draftKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, formId, savedEntry]);

  // Also autosave when the page is about to unload (refresh, close, crash)
  useEffect(() => {
    const handler = () => { persistCurrentDraft(); };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    window.addEventListener("amehnities:before-silent-update", handler);
    const visibilityHandler = () => {
      if (document.visibilityState === "hidden") handler();
    };
    document.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("amehnities:before-silent-update", handler);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [persistCurrentDraft]);

  useEffect(() => {
    return () => {
      try {
        const restoring = JSON.parse(sessionStorage.getItem(SILENT_UPDATE_RESTORE_KEY) || "null");
        if (restoring?.formId === formId) return;
        const active = JSON.parse(localStorage.getItem(ACTIVE_FORM_FILL_KEY) || "null");
        if (active?.formId === formId) {
          localStorage.removeItem(ACTIVE_FORM_FILL_KEY);
          window.dispatchEvent(new Event("amehnities:form-progress-changed"));
        }
      } catch {}
    };
  }, [formId]);

  const geofenceValidation = useMemo(() => {
    if (!gpsPosition || !isGeofenceEnabled) return null;
    return validatePosition(gpsPosition.lat, gpsPosition.lng);
  }, [gpsPosition, isGeofenceEnabled, validatePosition]);

  // Populate validatorRef so the voice engine can read the latest validator.
  // Runs every render — cheap and avoids stale-closure bugs.
  validatorRef.current = (): string[] => {
    const errs: string[] = [];
    const visibleQs = questions.filter(shouldShowQuestion);
    for (const q of visibleQs) {
      if (NON_INPUT_TYPES.has(q.type)) continue;
      const v = responses[q.id];
      if (q.required === true && (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0))) {
        errs.push(`${q.label.replace(/<[^>]*>/g, "")} is required`); continue;
      }
      if (v === undefined || v === null || v === "") continue;
      if (q.type === "number" && q.validation) {
        const n = parseFloat(v);
        if (!isNaN(n)) {
          if (q.validation.min !== undefined && q.validation.min !== null && n < q.validation.min) errs.push(`${q.label.replace(/<[^>]*>/g, "")} must be at least ${q.validation.min}`);
          if (q.validation.max !== undefined && q.validation.max !== null && n > q.validation.max) errs.push(`${q.label.replace(/<[^>]*>/g, "")} must be at most ${q.validation.max}`);
        }
      }
      if (q.validation?.regex && typeof q.validation.regex === "string" && q.validation.regex.trim()) {
        try {
          if (!new RegExp(q.validation.regex).test(String(v))) errs.push(q.constraintMessage || `${q.label.replace(/<[^>]*>/g, "")} has an invalid format`);
        } catch { /* skip invalid regex */ }
      }
    }
    for (const g of groups) {
      if (g.repeat && g.repeatCount && (repeatCounts[g.id] || 1) < g.repeatCount) {
        if (!incompleteRepeatReasons[g.id]?.trim()) errs.push(`Please give a reason for completing only ${repeatCounts[g.id] || 1} of ${g.repeatCount} iterations of ${g.label}`);
      }
    }
    // GPS no longer blocks submission. If a silent background fix happens
    // to exist (legacy paths), promote it into gpsPosition for metadata,
    // but never push an error for missing GPS.
    if (effectiveRequireLocation && !gpsPosition && backgroundLocation) {
      setGpsPosition({
        lat: backgroundLocation.lat,
        lng: backgroundLocation.lng,
        accuracy: backgroundLocation.accuracy,
      } as any);
    }

    if (effectiveEnforceGeofence && geofenceValidation && !geofenceValidation.isWithinGeofence) errs.push(geofenceValidation.message);
    return errs;
  };

  // Auto-start Voice Form Engine when TTS is enabled — no extra button tap needed.
  useEffect(() => {
    if (ttsEnabled && !voiceEngine.isActive && voiceFormQuestions.length > 0) {
      const t = setTimeout(() => { voiceEngine.startEngine(); }, 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsEnabled, voiceFormQuestions.length]);

  const updateResponse = (questionId: string, value: any) => {
    markUserInput();
    setResponses((prev) => ({ ...prev, [questionId]: value }));
    if (validationErrors[questionId]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    }
  };

  // Build name→id lookup for ${name} references
  const nameToIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    const allQuestions = [...questions, ...groups.flatMap(g => g.questions)];
    for (const q of allQuestions) {
      if (q.name) map[q.name] = q.id;
      map[q.id] = q.id;
    }
    return map;
  }, [questions, groups]);

  // Resolve ${name} references
  const resolveExpression = useCallback((expr: string): string => {
    return expr.replace(/\$\{(.+?)\}/g, (_, name) => {
      const qId = nameToIdMap[name];
      if (qId && responses[qId] !== undefined && responses[qId] !== null) {
        return String(responses[qId]);
      }
      return "";
    });
  }, [nameToIdMap, responses]);

  // Filter options for cascading selects based on cascadeParentId (structured) or choice_filter expression (legacy)
  const getFilteredOptions = useCallback((question: Question) => {
    if (!question.options) return question.options;

    // ── Priority 1: Structured cascade (cascadeParentId + parentValue) ─────────
    // This is set by the Form Builder's visual cascade wizard.
    if (question.cascadeParentId) {
      const parentQId = question.cascadeParentId;
      const parentResponse = responses[parentQId];

      if (!parentResponse) {
        // Parent not yet answered — show no options to prevent confusion.
        return [];
      }

      return question.options.filter(
        opt => !opt.parentValue || opt.parentValue === parentResponse
      );
    }

    // ── Priority 2: Raw choiceFilter string (legacy / XLSForm imports) ──────────
    if (!question.choiceFilter) return question.options;

    const filterExpr = question.choiceFilter.trim();
    if (!filterExpr) return question.options;

    // Resolve ${name} references in filter expression
    const resolved = resolveExpression(filterExpr);
    
    // Parse common ODK choice_filter patterns:
    // 1. "column=value" where column is an option property and value is resolved
    // 2. "state=${state}" resolved to "state=Lagos" → filter options with matching property

    // Try pattern: key=value
    const eqMatch = resolved.match(/^(\w+)\s*=\s*['"]?(.+?)['"]?\s*$/);
    if (eqMatch) {
      const [, filterKey, filterValue] = eqMatch;
      // Filter options that have a matching value property or label
      return question.options.filter(opt => {
        // Check if option value matches, or if the filter key matches the option's value field
        if (filterKey === "value" || filterKey === "name") {
          return opt.value === filterValue;
        }
        // For cascading selects, options may have been stored with extra metadata
        // In ODK, choice_filter filters based on columns in the choices sheet
        // Since we store options as {id, label, value}, we check value match
        return opt.value === filterValue || opt.label === filterValue;
      });
    }

    // If no pattern matched but there's a resolved value, try simple contains
    if (resolved && resolved !== filterExpr) {
      // The filter was resolved but didn't match known patterns
      // Show all options as fallback
      return question.options;
    }

    return question.options;
  }, [resolveExpression, responses]);

  // ── Auto-clear stale child responses when parent answers change ──────────────
  // When a parent question's response changes, any child question that declares
  // that parent via cascadeParentId may have a stale response (the user had picked
  // an option that no longer appears). Clear those to prevent bad submission data.
  const allFormQuestions = useMemo(
    () => [...questions, ...groups.flatMap(g => g.questions)],
    [questions, groups]
  );

  useEffect(() => {
    const cascadeChildren = allFormQuestions.filter(q =>
      q.cascadeParentId && !((isMdaChecklist || useMicroplanCascade) && MDA_GEO_NAMES.has(q.name || q.id))
    );
    if (cascadeChildren.length === 0) return;

    setResponses(prev => {
      let changed = false;
      const next = { ...prev };

      cascadeChildren.forEach(child => {
        const parentVal = next[child.cascadeParentId!];
        const childVal = next[child.id];
        if (childVal === undefined || childVal === null || childVal === "") return;

        // Check if the current child response is still a valid option given the parent answer
        const validOptions = (child.options ?? []).filter(
          opt => !opt.parentValue || opt.parentValue === parentVal
        );
        const validValues = validOptions.map(o => o.value);

        const isStale = Array.isArray(childVal)
          ? childVal.some(v => !validValues.includes(v))
          : !validValues.includes(childVal);

        if (isStale) {
          next[child.id] = Array.isArray(childVal) ? [] : "";
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  // Re-run whenever any response changes — cheap comparison guards the actual update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses, allFormQuestions, isMdaChecklist, useMicroplanCascade]);

  // Evaluate one PARSED condition against the current answers. Pure value
  // comparison — all regex parsing already happened (and was cached) upstream.
  const evalParsedCondition = useCallback(
    (c: ParsedCondition): boolean => {
      switch (c.kind) {
        case "always":
          return true;
        case "passthrough":
          // Unrecognised expression — preserve legacy "show" behaviour.
          return true;
        case "selected": {
          const qId = nameToIdMap[c.ref];
          if (!qId) return c.negate; // missing ref: not(selected) → true, selected → false
          const val = responses[qId];
          const has = Array.isArray(val)
            ? val.map(String).includes(c.value)
            : String(val ?? "") === c.value;
          return c.negate ? !has : has;
        }
        case "eq": {
          const qId = nameToIdMap[c.ref];
          if (!qId) return c.op === "!=";
          const raw = responses[qId];
          const matches = Array.isArray(raw)
            ? raw.map(String).includes(c.value)
            : String(raw ?? "") === c.value;
          return c.op === "=" ? matches : !matches;
        }
        case "num": {
          const qId = nameToIdMap[c.ref];
          if (!qId) return false;
          const raw = responses[qId];
          if (raw === undefined || raw === null || raw === "") return false;
          const val = parseFloat(String(raw));
          if (Number.isNaN(val)) return false;
          if (c.op === ">") return val > c.num;
          if (c.op === ">=") return val >= c.num;
          if (c.op === "<") return val < c.num;
          return val <= c.num;
        }
        case "truthy": {
          const qId = nameToIdMap[c.ref];
          if (!qId) return false;
          const val = responses[qId];
          if (Array.isArray(val)) return val.length > 0;
          return val !== undefined && val !== null && val !== "" && val !== false;
        }
        default:
          return true;
      }
    },
    [nameToIdMap, responses],
  );

  // Evaluate a full (possibly compound) relevant expression using the cached parse.
  const evalRelevantExpr = useCallback(
    (relevant: string): boolean => {
      const { groups: orGroups } = parseRelevant(relevant);
      // OR over AND-groups: a question shows if any AND-group is fully satisfied.
      return orGroups.some((andGroup) => andGroup.every(evalParsedCondition));
    },
    [evalParsedCondition],
  );

  // Precompute visibility for every question once per answer/structure change so
  // the many `.filter(shouldShowQuestion)` passes are O(1) lookups instead of
  // re-parsing each expression. Visibility only changes when a referenced answer
  // changes, but recomputing the whole map per render is cheap and correct.
  const visibilityMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const q of allFormQuestions) {
      map[q.id] = q.relevant ? evalRelevantExpr(q.relevant.trim()) : true;
    }
    return map;
  }, [allFormQuestions, evalRelevantExpr]);

  const shouldShowQuestion = useCallback(
    (question: Question): boolean => {
      if (!question.relevant) return true;
      if (question.id in visibilityMap) return visibilityMap[question.id];
      // Fallback for questions outside allFormQuestions (e.g. transient refs).
      return evalRelevantExpr(question.relevant.trim());
    },
    [visibilityMap, evalRelevantExpr],
  );



  // Check if any repeat groups are incomplete
  const getIncompleteRepeatGroups = useCallback(() => {
    return groups.filter(g => g.repeat && g.repeatCount && (repeatCounts[g.id] || 1) < g.repeatCount);
  }, [groups, repeatCounts]);

  // Non-input question types that should never block submission
  const NON_INPUT_TYPES = new Set(["calculate", "note", "acknowledge"]);

  const validateForm = useCallback((): { isValid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};
    const visibleQuestions = questions.filter(shouldShowQuestion);

    for (const question of visibleQuestions) {
      // Skip validation for non-input question types entirely
      if (NON_INPUT_TYPES.has(question.type)) continue;

      const value = responses[question.id];

      // Only validate required if the question is explicitly marked required
      if (question.required === true) {
        if (value === undefined || value === null || value === "") {
          const errMsg = question.constraintMessage || "This field is required";
          errors[question.id] = errMsg;
          trackValidationFailure(question.id, question.label, "required", String(value ?? ""));
          continue;
        }
        if (Array.isArray(value) && value.length === 0) {
          const errMsg = question.constraintMessage || "Please select at least one option";
          errors[question.id] = errMsg;
          trackValidationFailure(question.id, question.label, "required_multi", "[]");
          continue;
        }
      }

      // If no value provided and not required, skip further validation
      if (value === undefined || value === null || value === "") continue;

      // Only check min/max if validation object has actual values set
      if (question.type === "number" && question.validation) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          if (question.validation.min !== undefined && question.validation.min !== null && numValue < question.validation.min) {
            errors[question.id] = `Value must be at least ${question.validation.min}`;
            trackValidationFailure(question.id, question.label, `min:${question.validation.min}`, String(value));
          }
          if (question.validation.max !== undefined && question.validation.max !== null && numValue > question.validation.max) {
            errors[question.id] = `Value must be at most ${question.validation.max}`;
            trackValidationFailure(question.id, question.label, `max:${question.validation.max}`, String(value));
          }
        }
      }

      // Only check regex if it's a non-empty string
      if (question.validation?.regex && typeof question.validation.regex === "string" && question.validation.regex.trim()) {
        try {
          const regex = new RegExp(question.validation.regex);
          if (!regex.test(String(value))) {
            errors[question.id] = question.constraintMessage || "Invalid format";
            trackValidationFailure(question.id, question.label, `regex:${question.validation.regex}`, String(value));
          }
        } catch {
          // Invalid regex pattern — skip validation rather than blocking
          console.warn(`Invalid regex pattern for question ${question.id}: ${question.validation.regex}`);
        }
      }
    }

    // Validate repeat group iterations — require reason if incomplete.
    // Treatment Data Reporting Tools manage their own required-field gating in
    // the dedicated wizard, so skip the generic group validation for them.
    for (const group of groups) {
      if (isTreatmentTool) break;
      if (group.repeat && group.repeatCount) {
        const currentCount = repeatCounts[group.id] || 1;
        if (currentCount < group.repeatCount) {
          if (!incompleteRepeatReasons[group.id]?.trim()) {
            errors[`_repeat_reason_${group.id}`] = `Please provide a reason for completing only ${currentCount} of ${group.repeatCount} iterations for "${group.label}"`;
          }
        }
      }
    }

    // Validate ALL questions inside groups (both repeat and non-repeat groups)
    for (const group of groups) {
      if (isTreatmentTool) break;
      const iterations = group.repeat ? (repeatCounts[group.id] || 1) : 1;
      const visibleGroupQuestions = group.questions.filter(shouldShowQuestion);
      for (let iterIdx = 0; iterIdx < iterations; iterIdx++) {
        for (const question of visibleGroupQuestions) {
          if (NON_INPUT_TYPES.has(question.type)) continue;

          const qKey = group.repeat && iterations > 1 ? getRepeatKey(question.id, iterIdx) : question.id;
          const value = responses[qKey];

          // Required check
          if (question.required === true) {
            if (value === undefined || value === null || value === "") {
              errors[qKey] = question.constraintMessage || "This field is required";
              trackValidationFailure(question.id, question.label, "required", String(value ?? ""));
              continue;
            }
            if (Array.isArray(value) && value.length === 0) {
              errors[qKey] = question.constraintMessage || "Please select at least one option";
              trackValidationFailure(question.id, question.label, "required_multi", "[]");
              continue;
            }
          }

          if (value === undefined || value === null || value === "") continue;

          // Number min/max
          if (question.type === "number" && question.validation) {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              if (question.validation.min !== undefined && question.validation.min !== null && numValue < question.validation.min) {
                errors[qKey] = `Value must be at least ${question.validation.min}`;
                trackValidationFailure(question.id, question.label, `min:${question.validation.min}`, String(value));
              }
              if (question.validation.max !== undefined && question.validation.max !== null && numValue > question.validation.max) {
                errors[qKey] = `Value must be at most ${question.validation.max}`;
                trackValidationFailure(question.id, question.label, `max:${question.validation.max}`, String(value));
              }
            }
          }

          // Regex
          if (question.validation?.regex && typeof question.validation.regex === "string" && question.validation.regex.trim()) {
            try {
              const regex = new RegExp(question.validation.regex);
              if (!regex.test(String(value))) {
                errors[qKey] = question.constraintMessage || "Invalid format";
                trackValidationFailure(question.id, question.label, `regex:${question.validation.regex}`, String(value));
              }
            } catch {
              console.warn(`Invalid regex pattern for question ${question.id}: ${question.validation.regex}`);
            }
          }
        }
      }
    }

    // GPS no longer blocks submission. Promote any legacy silent fix into
    // gpsPosition for metadata, but never raise a validation error.
    if (effectiveRequireLocation && !gpsPosition && backgroundLocation) {
      setGpsPosition({
        lat: backgroundLocation.lat,
        lng: backgroundLocation.lng,
        accuracy: backgroundLocation.accuracy,
      } as any);
    }


    // Geofence validation — only if explicitly enforced
    if (effectiveEnforceGeofence && geofenceValidation && !geofenceValidation.isWithinGeofence) {
      errors["_geofence"] = geofenceValidation.message;
    }

    setValidationErrors(errors);
    return { isValid: Object.keys(errors).length === 0, errors };
  }, [questions, responses, gpsPosition, backgroundLocation, effectiveRequireLocation, effectiveEnforceGeofence, geofenceValidation, groups, repeatCounts, incompleteRepeatReasons]);

  // Per-section mandatory-field gate for the MDA paginated experience.
  // Blocks advancing to the next section until every required, visible question
  // in the current section has an answer. Geography questions (state/lga/ward/
  // community) are answered through <MdaLocationCascade> and validated here too,
  // so an incomplete location cascade also blocks navigation.
  const validateMdaSection = useCallback((groupIndex: number): boolean => {
    const group = groups[groupIndex];
    if (!group) return true;
    const errs: Record<string, string> = {};
    const iterations = group.repeat ? (repeatCounts[group.id] || 1) : 1;
    const visible = group.questions.filter(shouldShowQuestion);
    for (let iterIdx = 0; iterIdx < iterations; iterIdx++) {
      for (const q of visible) {
        if (NON_INPUT_TYPES.has(q.type)) continue;
        if (q.required !== true) continue;
        const qKey = group.repeat && iterations > 1 ? getRepeatKey(q.id, iterIdx) : q.id;
        const v = responses[qKey];
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
          errs[qKey] = q.constraintMessage || "This field is required";
        }
      }
    }
    if (Object.keys(errs).length > 0) {
      setValidationErrors((prev) => ({ ...prev, ...errs }));
      const firstKey = Object.keys(errs)[0];
      toast({
        title: "Complete this section first",
        description: `${Object.keys(errs).length} required question(s) in this section still need an answer before you can continue.`,
        variant: "destructive",
      });
      setTimeout(() => {
        const el =
          document.getElementById(`question-${firstKey}`) ||
          document.querySelector(`[data-question-name]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
      return false;
    }
    return true;
  }, [groups, responses, repeatCounts, shouldShowQuestion]);

  const handleSaveDraft = async () => {
    const hasRealResponses = Object.values(responses).some(
      (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)
    );
    if (!hasRealResponses) {
      toast({
        title: "Nothing to save",
        description: "Enter at least one answer before saving a draft.",
        variant: "destructive",
      });
      return;
    }
    userInteractedRef.current = true;
    const draft = {
      formId,
      responses,
      gpsPosition,
      savedAt: new Date().toISOString(),
      userEntered: true,
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
    setLastAutoSave(new Date());
    toast({ title: "Draft Saved", description: "Your form has been saved locally." });
  };

  const clearDraft = () => {
    localStorage.removeItem(draftKey);
    try { localStorage.removeItem(ACTIVE_FORM_FILL_KEY); } catch {}
    window.dispatchEvent(new Event("amehnities:form-progress-changed"));
  };

  // ---- Local-first workflow: Save As Draft / Finalize ----
  const buildLocalEntry = async (
    status: "draft" | "finalized",
  ): Promise<SavedFormEntry> => {
    let submissionType = "regular";
    if (settings.caseManagement?.enabled) {
      if (settings.caseManagement.action === "register") submissionType = "registration";
      else if (
        settings.caseManagement.action === "update" ||
        settings.caseManagement.action === "close"
      )
        submissionType = "follow_up";
    }

    const submissionData: Record<string, any> = { ...responses };
    for (const group of groups) {
      if (group.repeat && group.repeatCount && (repeatCounts[group.id] || 1) < group.repeatCount) {
        submissionData[`_repeat_reason_${group.id}`] = incompleteRepeatReasons[group.id] || "";
        submissionData[`_repeat_target_${group.id}`] = group.repeatCount;
        submissionData[`_repeat_actual_${group.id}`] = repeatCounts[group.id] || 1;
      }
    }
    if (fieldNotes.trim()) submissionData["_field_challenge_notes"] = fieldNotes.trim();
    if (audioClipUrl) submissionData["_audio_verification_path"] = audioClipUrl;

    let submissionLocation: { lat: number; lng: number } | null = null;
    const withinGeofence = geofenceValidation?.isWithinGeofence ?? null;
    try {
      const locMeta = await locEnforcement.buildMetadata(gpsQuestionAnswer);
      submissionData["form_metadata"] = {
        ...(submissionData["form_metadata"] || {}),
        auto_gps: locMeta.auto_gps,
        auto_gps_used: locMeta.auto_gps_used,
        gps_question_used: locMeta.gps_question_used,
        final_admin_levels_source: locMeta.final_admin_levels_source,
        gps_accuracy_m: locMeta.gps_accuracy_m,
        location_capture_timestamp: locMeta.location_capture_timestamp,
        resolved_admin: locMeta.resolved_admin,
      };
    } catch {
      /* metadata best-effort */
    }
    submissionLocation = gpsPosition
      ? { lat: gpsPosition.lat, lng: gpsPosition.lng }
      : locEnforcement.autoGps
        ? { lat: locEnforcement.autoGps.lat, lng: locEnforcement.autoGps.lng }
        : null;

    const now = new Date().toISOString();
    const respondentName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || profile?.email || "Unnamed respondent";
    submissionData["form_metadata"] = {
      ...(submissionData["form_metadata"] || {}),
      form_name: formName,
      respondent_name: respondentName,
      captured_by: userId,
      project_id: projectId,
      local_saved_at: now,
    };
    const gps = gpsPosition
      ? { lat: gpsPosition.lat, lng: gpsPosition.lng, accuracy: (gpsPosition as any).accuracy }
      : submissionLocation;

    return {
      id: savedEntry?.id || localEntryIdRef.current,
      userId,
      formId,
      formName,
      respondentName,
      formDescription,
      projectId,
      questions,
      groups,
      geofence: geofence ?? null,
      settings,
      responses,
      gps,
      submissionData,
      submissionLocation,
      withinGeofence,
      submissionType,
      status,
      createdAt: savedEntry?.createdAt || now,
      updatedAt: now,
      finalizedAt: status === "finalized" ? now : savedEntry?.finalizedAt ?? null,
      sentAt: null,
      submissionId: null,
      displayName: buildSavedEntryDisplayName({
        formName,
        respondentName,
        createdAt: savedEntry?.createdAt || now,
        updatedAt: now,
        finalizedAt: status === "finalized" ? now : savedEntry?.finalizedAt ?? null,
      }),
    };
  };

  const handleSaveLocalDraft = async () => {
    const hasRealResponses = Object.values(responses).some(
      (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
    );
    if (!hasRealResponses) {
      toast({
        title: "Nothing to save",
        description: "Enter at least one answer before saving a draft.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const entry = await buildLocalEntry("draft");
      await saveSavedEntry(entry);
      clearDraft();
      markResponsesSaved();
      toast({
        title: "Saved as Draft",
        description: "Find it under “Edit Saved Forms” to continue later.",
      });
      onSavedLocally?.();
    } catch (e) {
      toast({ title: "Save Failed", description: "Could not save the draft.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalizeLocal = async () => {
    // Enforce mandatory questions exactly like submit does.
    if (hasGpsQuestion && !locEnforcement.canSubmit && !gpsQuestionAnswer) {
      toast({
        title: "Cannot finalize",
        description: locEnforcement.blockReason || "Device location is not available.",
        variant: "destructive",
      });
      return;
    }
    const { isValid, errors: freshErrors } = validateForm();
    if (!isValid) {
      const requiredKeys = Object.keys(freshErrors).filter((k) => !k.startsWith("_"));
      const description = requiredKeys.length > 0
        ? `${requiredKeys.length} required question(s) need an answer. Taking you to the nearest one.`
        : Object.values(freshErrors)[0] || "Please fix the errors before finalizing.";
      toast({ title: "Cannot finalize", description, variant: "destructive" });
      setCollapsedGroups({});
      setTimeout(() => scrollToFirstError(freshErrors), 80);
      return;
    }
    setIsSubmitting(true);
    try {
      const entry = await buildLocalEntry("finalized");
      await saveSavedEntry(entry);
      if (settings.caseManagement?.enabled) {
        await processCaseAction(formId, responses, entry.id);
      }
      clearDraft();
      markResponsesSaved();
      toast({
        title: "Form Finalized",
        description: "Send it from “Send Finalized” when you're ready to sync.",
      });
      if (navigator.onLine) void syncFinalizedSavedForms();
      onSavedLocally?.();
    } catch (e) {
      toast({ title: "Finalize Failed", description: "Could not finalize the form.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // KoboCollect-style autosave into the Drafts tab: when a form is being filled
  // through the local workflow, keep the editable saved draft current without
  // requiring mandatory fields until the user finalizes it.
  useEffect(() => {
    if (!localWorkflow || !effectiveAutoSave || savedEntry?.status === "finalized") return;
    if (!userInteractedRef.current || !hasMeaningfulFormResponses(responses) || isSubmitting) return;
    const t = setTimeout(() => {
      buildLocalEntry("draft")
        .then((entry) => saveSavedEntry(entry))
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localWorkflow, effectiveAutoSave, responses, gpsPosition, isSubmitting, savedEntry?.status]);



  const handleSubmit = async () => {
    // PREVIEW MODE — validate exactly like a real submission so the builder
    // sees ODK/Kobo behaviour, but never write to the database.
    if (previewMode) {
      const { isValid, errors: freshErrors } = validateForm();
      if (!isValid) {
        const requiredKeys = Object.keys(freshErrors).filter((k) => !k.startsWith("_"));
        const description = requiredKeys.length > 0
          ? `${requiredKeys.length} required question(s) need an answer. Taking you to the nearest one.`
          : Object.values(freshErrors)[0] || "Please fix the errors before submitting.";
        toast({ title: "Preview validation", description, variant: "destructive" });
        setCollapsedGroups({});
        setTimeout(() => scrollToFirstError(freshErrors), 80);
        return;
      }
      toast({
        title: "Preview complete",
        description: "The form passed validation. No data was saved (preview mode).",
      });
      return;
    }

    if (requiresCaseSelection && !selectedCase) {
      console.log("No case selected — will auto-register if needed");
    }


    // LOCATION ENFORCEMENT — only enforce GPS when the form actually has a
    // geopoint question. Forms without a GPS question submit freely.
    if (hasGpsQuestion && !locEnforcement.canSubmit && !gpsQuestionAnswer) {
      toast({
        title: "Submission blocked",
        description: locEnforcement.blockReason || "Device location is not available.",
        variant: "destructive",
      });
      return;
    }
    // Accuracy is NOT a hard gate — submissions proceed at any accuracy.
    // The captured accuracy value is still saved with the submission and
    // surfaced in the UI as a warning, but it never blocks submission.

    const { isValid, errors: freshErrors } = validateForm();
    if (!isValid) {
      const requiredKeys = Object.keys(freshErrors).filter((k) => !k.startsWith("_"));
      const description = requiredKeys.length > 0
        ? `${requiredKeys.length} required question(s) need an answer. Taking you to the nearest one.`
        : Object.values(freshErrors)[0] || "Please fix the errors before submitting.";
      toast({ title: "Submission blocked", description, variant: "destructive" });
      // Bring the respondent to the missed mandatory question nearest to where
      // they currently are; expand any collapsed group so the target renders.
      setCollapsedGroups({});
      setTimeout(() => scrollToFirstError(freshErrors), 80);
      return;
    }

    // Check for incomplete repeat groups and show confirmation
    const incompleteGroups = getIncompleteRepeatGroups();
    if (incompleteGroups.length > 0) {
      // Check all have reasons
      const allHaveReasons = incompleteGroups.every(g => incompleteRepeatReasons[g.id]?.trim());
      if (allHaveReasons) {
        setShowIncompleteConfirm(true);
        return;
      }
    }

    await doSubmit();
  };


  const doSubmit = async () => {
    setIsSubmitting(true);
    setShowIncompleteConfirm(false);

    try {
      let submissionType = "regular";
      if (settings.caseManagement?.enabled) {
        if (settings.caseManagement.action === "register") submissionType = "registration";
        else if (settings.caseManagement.action === "update" || settings.caseManagement.action === "close") submissionType = "follow_up";
      }

      // Include incomplete repeat reasons in submission data
      const submissionData = { ...responses };
      for (const group of groups) {
        if (group.repeat && group.repeatCount && (repeatCounts[group.id] || 1) < group.repeatCount) {
          submissionData[`_repeat_reason_${group.id}`] = incompleteRepeatReasons[group.id] || "";
          submissionData[`_repeat_target_${group.id}`] = group.repeatCount;
          submissionData[`_repeat_actual_${group.id}`] = repeatCounts[group.id] || 1;
        }
      }

      // Include field notes if provided
      if (fieldNotes.trim()) {
        submissionData["_field_challenge_notes"] = fieldNotes.trim();
      }

      // Include audio verification clip reference
      if (audioClipUrl) {
        submissionData["_audio_verification_path"] = audioClipUrl;
      }

      // Build location enforcement metadata BEFORE picking the submission location.
      // Prefer GPS-question coord (if any) for downstream admin resolution.
      const locMeta = await locEnforcement.buildMetadata(gpsQuestionAnswer);
      submissionData["form_metadata"] = {
        ...(submissionData["form_metadata"] || {}),
        auto_gps: locMeta.auto_gps,
        auto_gps_used: locMeta.auto_gps_used,
        gps_question_used: locMeta.gps_question_used,
        final_admin_levels_source: locMeta.final_admin_levels_source,
        gps_accuracy_m: locMeta.gps_accuracy_m,
        location_capture_timestamp: locMeta.location_capture_timestamp,
        resolved_admin: locMeta.resolved_admin,
      };

      // Use GPS question position first, fall back to enforced auto_gps
      const submissionLocation = gpsPosition
        ? { lat: gpsPosition.lat, lng: gpsPosition.lng }
        : locEnforcement.autoGps
          ? { lat: locEnforcement.autoGps.lat, lng: locEnforcement.autoGps.lng }
          : null;

      const result = await saveSubmission(
        formId,
        userId,
        submissionData,
        submissionLocation,
        geofenceValidation?.isWithinGeofence ?? null,
        submissionType
      );


      if (result.success) {
        if (settings.caseManagement?.enabled) {
          await processCaseAction(formId, responses, result.id);
        }

        // Save tracking data (form timing, validation failures, skipped questions)
        const labelMap: Record<string, string> = {};
        [...questions, ...groups.flatMap(g => g.questions)].forEach(q => { labelMap[q.id] = q.label; });
        await saveTrackingData(result.id, responses, labelMap);

        // Save field notes as tracking event
        if (fieldNotes.trim()) {
          await supabase.from("form_tracking_events" as any).insert({
            form_id: formId,
            submission_id: result.id,
            user_id: userId,
            event_type: "field_note",
            event_data: { notes: fieldNotes.trim(), submitted_at: new Date().toISOString() },
          });
        }

        // Capture photo/video metadata for media questions
        const mediaQuestions = [...questions, ...groups.flatMap(g => g.questions)].filter(
          q => (q.type === "image" || q.type === "video") && responses[q.id]
        );
        for (const mq of mediaQuestions) {
          await captureMetadata(mq.id, mq.type === "image" ? "photo" : "video", result.id);
        }

        clearDraft();
        markResponsesSaved();
        setLastSubmissionOffline(!!result.offline);
        // MDA Supervisory Checklist → launch the Repeat Household Coverage
        // Survey (repeatable, sampled) if enabled; else the legacy 3D opt-in;
        // otherwise show the thank-you dialog.
        if (offerHouseholdSurvey) {
          const answer = (...names: string[]) => {
            for (const name of names) {
              const direct = responses[name];
              if (direct !== undefined && direct !== null && String(direct).trim() !== "") return String(direct);
              const id = nameToIdMap[name];
              const byId = id ? responses[id] : undefined;
              if (byId !== undefined && byId !== null && String(byId).trim() !== "") return String(byId);
            }
            return "";
          };
          const handoffGps = gpsQuestionAnswer || gpsPosition || locEnforcement.autoGps || backgroundLocation || null;
          setHouseholdSurveyCtx({
            submissionId: result.id,
            target: Math.max(1, Number((settings as any).householdSampleSize) || 1),
            location: {
              state: answer("state", "state_name", "admin_state"),
              lga: answer("lga", "lga_name", "local_government", "local_government_area"),
              ward: answer("ward", "ward_name"),
              flhf_name: answer("flhf_name", "flhf", "health_facility", "facility", "facility_name"),
              community_name: answer("community_name", "community"),
              settlement_name: answer("settlement_name", "settlement"),
            },
            gps: handoffGps ? { lat: handoffGps.lat, lng: handoffGps.lng, accuracy: (handoffGps as any).accuracy } : null,
          });
        } else if (offerCoverageEvaluation) {
          setShowCoverageOptIn(true);
        } else {
          setShowThankYou(true);
        }
        // Notify the parent that submission succeeded but DON'T auto-close —
        // the user will dismiss the thank-you dialog, which then closes the form.
        onSubmitSuccess?.(result.id);
      }
    } catch (error) {
      console.error("Submission error:", error);
      toast({ title: "Submission Failed", description: "An error occurred. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Bind handleSubmit to the ref for the voice engine
  handleSubmitRef.current = handleSubmit;

  const visibleQuestions = questions.filter(shouldShowQuestion);

  const getRepeatKey = (questionId: string, iteration: number) => `${questionId}__${iteration}`;

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Add iteration to a repeat group (capped at repeatCount)
  const addIteration = (groupId: string, maxCount?: number) => {
    setRepeatCounts(prev => {
      const current = prev[groupId] || 1;
      if (maxCount && current >= maxCount) {
        toast({
          title: "Maximum iterations reached",
          description: `You cannot add more than ${maxCount} iterations for this group.`,
          variant: "destructive",
        });
        return prev;
      }
      return { ...prev, [groupId]: current + 1 };
    });
  };

  const removeIteration = (groupId: string) => {
    setRepeatCounts(prev => ({
      ...prev,
      [groupId]: Math.max(1, (prev[groupId] || 1) - 1),
    }));
  };

  // Compute calculate value (used by both render paths)
  const computeCalcValue = useCallback((question: Question, qKey: string) => {
    const calcExpr = question.calculation || "";
    if (!calcExpr) return "";
    try {
      const resolved = calcExpr.replace(/\$\{(.+?)\}/g, (_, name) => {
        const qId = nameToIdMap[name];
        if (qId && responses[qId] !== undefined && responses[qId] !== null) {
          const v = responses[qId];
          if (typeof v === "object" && v.lat !== undefined) return String(v.lat);
          return String(v);
        }
        return "0";
      });
      try {
        const round = (value: any, places = 0) => {
          const n = Number(value);
          const p = Number(places) || 0;
          if (!Number.isFinite(n)) return "";
          const factor = Math.pow(10, p);
          return Math.round(n * factor) / factor;
        };
        const jsExpr = resolved
          .replace(/\bdiv\b/gi, "/")
          .replace(/\bmod\b/gi, "%")
          .replace(/\bround\s*\(/gi, "round(")
          .trim();
        const identifiers = jsExpr.match(/[A-Za-z_]\w*/g) || [];
        const safeIdentifiers = identifiers.every((id) => id === "round");
        if (safeIdentifiers && /^[\d\s+\-*/%().,A-Za-z_]+$/.test(jsExpr)) {
          const out = Function("round", '"use strict"; return (' + jsExpr + ')')(round);
          return Number.isFinite(Number(out)) ? String(out) : "";
        }
        return resolved;
      } catch {
        return resolved;
      }
    } catch {
      return "";
    }
  }, [nameToIdMap, responses]);

  // Auto-compute the active MDA section's calculate questions OUTSIDE of render.
  // Doing this in render previously scheduled a setState cascade on every paint,
  // which made the section nav / Prev / Next buttons feel sluggish.
  useEffect(() => {
    if (!isMdaChecklist || groups.length === 0) return;
    const idx = Math.min(mdaActiveIndex, groups.length - 1);
    const group = groups[idx];
    if (!group) return;
    const updates: Record<string, string> = {};
    group.questions
      .filter((q) => q.type === "calculate" && shouldShowQuestion(q))
      .forEach((q) => {
        const val = computeCalcValue(q, q.id);
        if (val !== responses[q.id]) updates[q.id] = val;
      });
    if (Object.keys(updates).length > 0) {
      setResponses((prev) => ({ ...prev, ...updates }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMdaChecklist, mdaActiveIndex, groups, responses, computeCalcValue]);


  const renderQuestionCard = (question: Question, questionNumber: number, keyPrefix = "") => {
    const qKey = keyPrefix || question.id;
    const error = validationErrors[qKey];

    // For calculate questions, auto-compute and don't show a numbered card — just show the value silently
    if (question.type === "calculate") {
      const computedValue = computeCalcValue(question, qKey);
      // Auto-update response
      if (computedValue !== responses[qKey]) {
        setTimeout(() => {
          setResponses(prev => ({ ...prev, [qKey]: computedValue }));
        }, 0);
      }
      // Calculate questions are hidden from the user — no visible card
      return null;
    }

    // Note questions render as decorative cards and must NOT be numbered.
    if (question.type === "note") {
      return (
        <div key={qKey} id={`question-${qKey}`}>
          <FormNote seed={question.id} text={question.hint || question.label || "This is an informational note."} />
        </div>
      );
    }

    // Build visible questions list for sequential TTS
    const getVisibleQuestionInfos = () => {
      const infos: { id: string; label: string; type: string; options?: string[]; required?: boolean }[] = [];
      groups.forEach(g => {
        g.questions.filter(q => shouldShowQuestion(q) && q.type !== "calculate").forEach(q => {
          infos.push({ id: q.id, label: q.label, type: q.type, options: q.options?.map(o => o.label), required: q.required });
        });
      });
      visibleQuestions.filter(q => q.type !== "calculate").forEach(q => {
        infos.push({ id: q.id, label: q.label, type: q.type, options: q.options?.map(o => o.label), required: q.required });
      });
      return infos;
    };

    const handleQuestionTap = (qKey: string) => {
      if (!ttsEnabled) return;
      const infos = getVisibleQuestionInfos();
      speakFromQuestion(infos, qKey);
      // Also activate voice input for this question
      setActiveVoiceField(qKey);
      if (voiceSupported && voiceEnabled) {
        startListening();
      }
    };

    const isCurrentTTSQuestion = ttsEnabled && currentQuestionId === qKey;
    const isWaitingForConfirmation = isCurrentTTSQuestion && awaitingConfirmation;

    const isVoiceEngineActive = voiceEngine.isActive && voiceEngine.currentQuestion?.id === qKey;

    return (
      <Card
        key={qKey}
        id={`question-${qKey}`}
        data-question-name={question.name || undefined}
        className={`form-card transition-all duration-300 ${error ? "ring-1 ring-destructive" : ""} ${ttsEnabled ? "cursor-pointer" : ""} ${
          isCurrentTTSQuestion || isVoiceEngineActive ? "ring-2 ring-primary shadow-lg" : ""
        }`}
        onClick={() => handleQuestionTap(qKey)}
      >
        <CardContent className="pt-5">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                isCurrentTTSQuestion ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
              }`}>
                {questionNumber}
              </span>
              <div className="flex-1">
                <Label className="text-base font-medium">
                  <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.label) }} />
                  {question.required && <span className="ml-1 text-destructive">*</span>}
                </Label>
                {question.hint && (
                  <p className="mt-1 text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.hint) }} />
                )}
                {/* Status badge for current TTS question */}
                {isCurrentTTSQuestion && (
                  <div className="mt-1 flex items-center gap-2">
                    {isWaitingForConfirmation && isListening && (
                      <Badge variant="outline" className="text-xs animate-pulse border-primary text-primary">
                        <Mic className="h-3 w-3 mr-1" /> Listening...
                      </Badge>
                    )}
                    {isSpeaking && (
                      <Badge variant="outline" className="text-xs border-primary text-primary">
                        🔊 Reading...
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {/* Voice input indicator for this question */}
              {ttsEnabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isListening && activeVoiceField === qKey) {
                      stopListening();
                      setActiveVoiceField(null);
                    } else {
                      setActiveVoiceField(qKey);
                      if (voiceSupported) startListening();
                    }
                  }}
                  className={`p-2 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
                    isListening && activeVoiceField === qKey
                      ? "bg-destructive/10 text-destructive animate-pulse"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  title={isListening && activeVoiceField === qKey ? "Stop voice input" : "Speak your answer"}
                >
                  {isListening && activeVoiceField === qKey ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
            </div>
            <div className="ml-8" onBlur={() => bumpExpertTrigger(qKey)}>
              {renderQuestionInputWithKey(question, qKey)}
              {isListening && activeVoiceField === qKey && interimTranscript && (
                <p className="text-xs text-muted-foreground mt-1 italic animate-pulse">{interimTranscript}</p>
              )}
              {error && (
                <p className="mt-2 text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {error}
                </p>
              )}
              {/* Mixture-of-Experts inline validator (math / language / validation) */}
              <ExpertFieldValidator
                context={buildExpertContext(question, qKey)}
                triggerKey={expertTriggers[qKey]}
                onAcceptSuggestion={(val) => {
                  setResponses(prev => ({ ...prev, [qKey]: val }));
                  if (validationErrors[qKey]) {
                    setValidationErrors(prev => { const u = { ...prev }; delete u[qKey]; return u; });
                  }
                }}
              />
              {/* "Next Question" button when TTS is waiting on this question */}
              {isWaitingForConfirmation && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2 border-primary text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmAndAdvance();
                  }}
                >
                  Next Question →
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderQuestionInputWithKey = (question: Question, qKey: string) => {
    const value = responses[qKey];
    const error = validationErrors[qKey];
    const update = (val: any) => {
      markUserInput();
      setResponses(prev => ({ ...prev, [qKey]: val }));
      if (validationErrors[qKey]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qKey]; return u; });
      }
    };

    switch (question.type) {
      case "text":
        return (
          <div className="relative">
            <Input
              value={value || ""}
              onChange={(e) => update(e.target.value)}
              placeholder={isListening && activeVoiceField === qKey ? "Listening..." : "Enter your answer"}
              className={error ? "border-destructive pr-10" : "pr-10"}
            />
            {voiceEnabled && voiceSupported && (
              <button
                type="button"
                onClick={() => {
                  if (isListening && activeVoiceField === qKey) {
                    stopListening();
                    setActiveVoiceField(null);
                  } else {
                    setActiveVoiceField(qKey);
                    startListening();
                  }
                }}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors ${
                  isListening && activeVoiceField === qKey
                    ? "bg-destructive/10 text-destructive animate-pulse"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={isListening && activeVoiceField === qKey ? "Stop voice input" : "Start voice input"}
              >
                {isListening && activeVoiceField === qKey ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            {isListening && activeVoiceField === qKey && interimTranscript && (
              <p className="text-xs text-muted-foreground mt-1 italic">{interimTranscript}</p>
            )}
          </div>
        );
      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => update(e.target.value)}
            placeholder="Enter a number"
            min={question.validation?.min}
            max={question.validation?.max}
            className={error ? "border-destructive" : ""}
          />
        );
      case "note":
        return <FormNote seed={question.id} text={question.hint || question.label || "This is an informational note."} />;
      case "select_one": {
        // Apply cascading choice_filter
        const filteredOptions = getFilteredOptions(question);
        return (
          <RadioGroup value={value || ""} onValueChange={(val) => update(val)} className="odk-choice-list">
            {filteredOptions?.map((option) => (
              <Label
                key={option.id}
                htmlFor={`${qKey}-${option.id}`}
                className="odk-choice-row"
              >
                <RadioGroupItem value={option.value} id={`${qKey}-${option.id}`} className="odk-choice-control" />
                <span className="odk-choice-label">{option.label}</span>
              </Label>
            ))}
            {filteredOptions?.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No options available based on your previous selections.</p>
            )}
          </RadioGroup>
        );
      }
      case "select_multiple": {
        const filteredOptions = getFilteredOptions(question);
        return (
          <div className="odk-choice-list">
            {filteredOptions?.map((option) => (
              <Label
                key={option.id}
                htmlFor={`${qKey}-${option.id}`}
                className="odk-choice-row"
              >
                <Checkbox
                  id={`${qKey}-${option.id}`}
                  className="odk-choice-control"
                  checked={(value || []).includes(option.value)}
                  onCheckedChange={(checked) => {
                    const current = value || [];
                    update(checked ? [...current, option.value] : current.filter((v: string) => v !== option.value));
                  }}
                />
                <span className="odk-choice-label">{option.label}</span>
              </Label>
            ))}
            {filteredOptions?.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No options available based on your previous selections.</p>
            )}
          </div>
        );
      }

      case "date":
        return (
          <DateInput
            value={value}
            onChange={(v) => update(v)}
            dateFormat={question.dateFormat}
            hasError={!!error}
          />
        );
      case "time":
        return <Input type="time" value={value || ""} onChange={(e) => update(e.target.value)} className={error ? "border-destructive" : ""} />;
      case "datetime":
        return (
          <DateInput
            value={value}
            onChange={(v) => update(v)}
            dateFormat={question.dateFormat}
            withTime
            hasError={!!error}
          />
        );
      case "range":
        return (
          <div className="space-y-2">
            <Slider value={[value || question.validation?.min || 0]} onValueChange={([val]) => update(val)} min={question.validation?.min || 0} max={question.validation?.max || 100} step={1} />
            <p className="text-center text-sm text-muted-foreground">Value: {value || question.validation?.min || 0}</p>
          </div>
        );
      case "geopoint":
        return <GPSCapture value={value} onChange={(pos) => { update(pos); if (!gpsPosition && pos) setGpsPosition(pos); }} geofenceValidation={geofenceValidation} autoTrigger={voiceTriggers[qKey] === "capture_gps"} />;
      case "image":
        return (
          <PhotoCapture
            value={value}
            onChange={(photo) => update(photo)}
            autoTrigger={voiceTriggers[qKey] === "take_photo"}
            cameraOnly={question.media?.cameraOnly}
            frontCamera={question.media?.frontCamera}
            maxResolutionPx={question.media?.maxResolutionPx}
            quality={question.media?.quality}
          />
        );
      case "audio":
        return <AudioCapture value={value} onChange={(audio) => update(audio)} autoTrigger={voiceTriggers[qKey] === "record_audio"} />;
      case "signature":
        return (
          <SignatureCapture
            value={value}
            onChange={(sig) => update(sig)}
            penColor={question.signature?.penColor}
            penWidth={question.signature?.penWidth}
            backgroundColor={question.signature?.backgroundColor}
          />
        );
      case "barcode":
        return <BarcodeScanner value={value} onChange={(code) => update(code)} autoTrigger={voiceTriggers[qKey] === "scan_barcode"} />;
      case "video":
        return <VideoCapture value={value} onChange={(video) => update(video)} autoTrigger={voiceTriggers[qKey] === "record_video"} />;
      case "acknowledge":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox id={qKey} checked={value || false} onCheckedChange={(checked) => update(checked)} />
            <Label htmlFor={qKey}>I acknowledge</Label>
          </div>
        );
      case "calculate":
        return null;
      default:
        return <Textarea value={value || ""} onChange={(e) => update(e.target.value)} placeholder="Enter your response" className={error ? "border-destructive" : ""} />;
    }
  };

  const renderQuestionInput = (question: Question) => {
    const value = responses[question.id];
    const error = validationErrors[question.id];

    switch (question.type) {
      case "text":
        return (
          <Input
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            placeholder="Enter your answer"
            className={error ? "border-destructive" : ""}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            placeholder="Enter a number"
            min={question.validation?.min}
            max={question.validation?.max}
            className={error ? "border-destructive" : ""}
          />
        );

      case "note":
        return (
          <FormNote seed={question.id} text={question.hint || question.label || "This is an informational note."} />
        );

      case "select_one": {
        const filteredOptions = getFilteredOptions(question);
        return (
          <RadioGroup value={value || ""} onValueChange={(val) => updateResponse(question.id, val)} className="odk-choice-list">
            {filteredOptions?.map((option) => (
              <Label
                key={option.id}
                htmlFor={`${question.id}-${option.id}`}
                className="odk-choice-row"
              >
                <RadioGroupItem value={option.value} id={`${question.id}-${option.id}`} className="odk-choice-control" />
                <span className="odk-choice-label">{option.label}</span>
              </Label>
            ))}
            {filteredOptions?.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No options available based on your previous selections.</p>
            )}
          </RadioGroup>
        );
      }

      case "select_multiple": {
        const filteredOptions = getFilteredOptions(question);
        return (
          <div className="odk-choice-list">
            {filteredOptions?.map((option) => (
              <Label
                key={option.id}
                htmlFor={`${question.id}-${option.id}`}
                className="odk-choice-row"
              >
                <Checkbox
                  id={`${question.id}-${option.id}`}
                  className="odk-choice-control"
                  checked={(value || []).includes(option.value)}
                  onCheckedChange={(checked) => {
                    const current = value || [];
                    if (checked) {
                      updateResponse(question.id, [...current, option.value]);
                    } else {
                      updateResponse(question.id, current.filter((v: string) => v !== option.value));
                    }
                  }}
                />
                <span className="odk-choice-label">{option.label}</span>
              </Label>
            ))}
            {filteredOptions?.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No options available based on your previous selections.</p>
            )}
          </div>
        );
      }


      case "date":
        return (
          <DateInput
            value={value}
            onChange={(v) => updateResponse(question.id, v)}
            dateFormat={question.dateFormat}
            hasError={!!error}
          />
        );

      case "time":
        return <Input type="time" value={value || ""} onChange={(e) => updateResponse(question.id, e.target.value)} className={error ? "border-destructive" : ""} />;

      case "datetime":
        return (
          <DateInput
            value={value}
            onChange={(v) => updateResponse(question.id, v)}
            dateFormat={question.dateFormat}
            withTime
            hasError={!!error}
          />
        );

      case "range":
        return (
          <div className="space-y-2">
            <Slider
              value={[value || question.validation?.min || 0]}
              onValueChange={([val]) => updateResponse(question.id, val)}
              min={question.validation?.min || 0}
              max={question.validation?.max || 100}
              step={1}
            />
            <p className="text-center text-sm text-muted-foreground">
              Value: {value || question.validation?.min || 0}
            </p>
          </div>
        );

      case "geopoint":
        return (
          <GPSCapture
            value={value}
            onChange={(pos) => { updateResponse(question.id, pos); if (!gpsPosition && pos) setGpsPosition(pos); }}
            geofenceValidation={geofenceValidation}
          />
        );

      case "image":
        return (
          <PhotoCapture
            value={value}
            onChange={(photo) => updateResponse(question.id, photo)}
            cameraOnly={question.media?.cameraOnly}
            frontCamera={question.media?.frontCamera}
            maxResolutionPx={question.media?.maxResolutionPx}
            quality={question.media?.quality}
          />
        );

      case "audio":
        return <AudioCapture value={value} onChange={(audio) => updateResponse(question.id, audio)} />;

      case "signature":
        return (
          <SignatureCapture
            value={value}
            onChange={(sig) => updateResponse(question.id, sig)}
            penColor={question.signature?.penColor}
            penWidth={question.signature?.penWidth}
            backgroundColor={question.signature?.backgroundColor}
          />
        );

      case "barcode":
        return <BarcodeScanner value={value} onChange={(code) => updateResponse(question.id, code)} />;

      case "video":
        return <VideoCapture value={value} onChange={(video) => updateResponse(question.id, video)} />;

      case "acknowledge":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={question.id}
              checked={value || false}
              onCheckedChange={(checked) => updateResponse(question.id, checked)}
            />
            <Label htmlFor={question.id}>I acknowledge</Label>
          </div>
        );

      case "calculate":
        return null;

      default:
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            placeholder="Enter your response"
            className={error ? "border-destructive" : ""}
          />
        );
    }
  };

  // Inclusive Communication Mode — full-screen deaf-accessible form filler
  if (inclusiveMode) {
    return (
      <DeafAccessibleFormFiller
        formName={formName}
        questions={questions}
        groups={groups}
        responses={responses}
        onSetResponse={(qId, val) => { userInteractedRef.current = true; setResponses(prev => ({ ...prev, [qId]: val })); }}
        onSubmit={handleSubmit}
        onClose={() => setInclusiveMode(false)}
        isSubmitting={isSubmitting}
      />
    );
  }

  // ── Treatment Data Reporting Tools — dedicated wizard experience ──────────
  if (isTreatmentTool && detectedTreatmentTool) {
    return (
      <>
        <TreatmentToolWizard
          tool={detectedTreatmentTool}
          formName={formName}
          projectId={projectId}
          responses={responses}
          nameToId={mdaNameToId}
          stateScope={(settings as any).mdaStateScope}
          isSubmitting={isSubmitting}
          isOnline={isOnline}
          onSet={(updates) => {
            userInteractedRef.current = true;
            setResponses((prev) => ({ ...prev, ...updates }));
          }}
          onSubmit={localWorkflow ? handleFinalizeLocal : handleSubmit}
          onSaveDraft={localWorkflow ? handleSaveLocalDraft : handleSaveDraft}
          onClose={handleCloseAttempt}
          submitLabel={
            localWorkflow
              ? savedEntry?.status === "finalized" ? "Update & Re-Finalize" : "Finalize Form"
              : detectedTreatmentTool === "community_treatment_register" ? "Submit Register" : "Submit Form"
          }
        />
        <ThankYouDialog
          open={showThankYou}
          offline={lastSubmissionOffline}
          formName={formName}
          submitterName={profile?.first_name}
          onClose={() => {
            setShowThankYou(false);
            onClose();
          }}
        />
        <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved answers on this form. If you leave now, your
                changes will be lost. Save it as a draft first to continue later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              {localWorkflow && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    setShowLeaveConfirm(false);
                    await handleSaveLocalDraft();
                  }}
                >
                  Save as draft
                </Button>
              )}
              <AlertDialogAction
                onClick={() => {
                  setShowLeaveConfirm(false);
                  onClose();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Leave without saving
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <div data-mda-scroll data-mda-mode={isMdaChecklist ? "true" : undefined} style={formThemeStyle} className={isMdaChecklist
      ? "fixed inset-0 z-[70] isolate flex flex-col overflow-y-auto bg-background lg:pl-64"
      : "flex min-h-full flex-col bg-background relative"}>
      {/* Skip-logic debug panel (admins/owners only) — confirm at a glance why
          any question is shown or hidden given the current answers. */}
      {isAdmin && (
        <>
          <button
            type="button"
            onClick={() => setShowSkipDebug((v) => !v)}
            aria-label="Toggle skip logic debug panel"
            className="fixed bottom-24 right-4 z-[150] flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary shadow-lg transition-transform hover:scale-105"
          >
            <Bug className="h-5 w-5" />
          </button>
          <SkipLogicDebugPanel
            questions={allFormQuestions}
            responses={responses}
            open={showSkipDebug}
            onClose={() => setShowSkipDebug(false)}
          />
        </>
      )}
      {/* Apply optional custom form theme as scoped CSS variable overrides. */}
      {/* Location enforcement runs SILENTLY in the background.
          No gate modal, no header bar, no toasts — capture happens invisibly
          and metadata is still attached to every submission. */}

      {/* MDA Supervisory Checklist left navigation panel */}
      {isMdaChecklist && (
        <MdaChecklistSidebar
          groups={groups}
          formName={formName}
          lastSaved={lastAutoSave}
          activeIndex={mdaActiveIndex}
          onSelect={goToMdaSection}
          onReview={() => goToMdaSection(groups.length - 1)}
        />
      )}

      {!isMdaChecklist && (
        <div
          className="flex items-center justify-between border-b border-border bg-card px-4 py-3"
          style={formTheme.enabled ? { backgroundColor: "hsl(var(--form-header-bg))", color: "hsl(var(--form-header-text))" } : undefined}
        >
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleCloseAttempt}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h1
                  className="font-display text-lg font-bold text-foreground"
                  style={formTheme.enabled ? { color: "hsl(var(--form-header-text))" } : undefined}
                >
                  {formName || "Form"}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {previewMode && (
                    <Badge variant="secondary" className="text-xs">
                      Preview
                    </Badge>
                  )}
                  {isOnline ? (
                    <Badge variant="outline" className="text-xs">
                      <Wifi className="h-3 w-3 mr-1 text-status-success" />
                      Online
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      <WifiOff className="h-3 w-3 mr-1 text-status-warning" />
                      Offline
                    </Badge>
                  )}
                  {pendingCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {pendingCount} pending
                    </Badge>
                  )}
                  {effectiveAutoSave && lastAutoSave && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      <Save className="h-3 w-3 mr-1" />
                      Saved {lastAutoSave.toLocaleTimeString()}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={inclusiveMode ? "default" : "outline"}
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setInclusiveMode(true)}
                title="Hearing Impairment Mode — Inclusive data collection"
              >
                <HandMetal className="h-4 w-4" />
                <span className="hidden sm:inline">Inclusive</span>
              </Button>
              <AuthConfidenceMeter posture={authPosture} />
            </div>
          </div>
        </div>
      )}



      {/* GPS & Geofence Status Bar */}
      {!isMdaChecklist && (effectiveRequireLocation || isGeofenceEnabled) && (() => {
        // Per-form GPS accuracy warning threshold (metres). Default 30m if unset.
        // This is WARNING-ONLY — submission is never blocked by accuracy.
        const warnThresholdM = Number(settings?.gpsAccuracyWarningM) > 0
          ? Number(settings.gpsAccuracyWarningM)
          : 30;
        const acc = gpsPosition?.accuracy ?? null;
        const lowAccuracy = acc !== null && acc > warnThresholdM;
        return (
          <div className={`border-b px-4 py-2 ${lowAccuracy ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/30"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {isGpsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : gpsPosition ? (
                    <MapPin className={`h-4 w-4 ${lowAccuracy ? "text-amber-600" : "text-green-500"}`} />
                  ) : (
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={`text-xs ${lowAccuracy ? "text-amber-700 font-medium" : "text-muted-foreground"}`}>
                    {isGpsLoading
                      ? "Getting location..."
                      : gpsPosition
                        ? `±${Math.round(gpsPosition.accuracy)}m accuracy${lowAccuracy ? ` (warning > ${warnThresholdM}m — you can still submit)` : ""}`
                        : "No GPS"}
                  </span>
                </div>
                {isGeofenceEnabled && gpsPosition && geofenceValidation && (
                  <div className="flex items-center gap-2">
                    {geofenceValidation.isWithinGeofence ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className={`text-xs ${geofenceValidation.isWithinGeofence ? "text-green-600" : "text-destructive"}`}>
                      {geofenceValidation.isWithinGeofence ? "In zone" : `${geofenceValidation.distance}m outside`}
                    </span>
                  </div>
                )}
                <BatteryOptimizationIndicator state={stationaryState} />
              </div>
            </div>
          </div>
        );
      })()}


      {/* Continuous Auth Lock Overlay */}
      {authPosture.isLocked && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Security Lock Active</p>
              <p className="text-xs text-destructive/80">{authPosture.lockReason || "Behavioral anomaly detected. Please re-authenticate."}</p>
            </div>
          </div>
        </div>
      )}

      {/* Geofence Blocking Banner */}
      {effectiveEnforceGeofence && geofenceValidation && !geofenceValidation.isWithinGeofence && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Submission Blocked — Outside Geofence</p>
              <p className="text-xs text-destructive/80">{geofenceValidation.message}. You must be within the designated area to submit this form.</p>
            </div>
          </div>
        </div>
      )}

      {settings.caseManagement?.enabled && (
        <div className="border-b border-border bg-muted/30 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              {selectedCase ? (
                <>
                  <span className="text-sm font-medium">{selectedCase.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {settings.caseManagement.action === "update" ? "Follow-up" : settings.caseManagement.action === "close" ? "Close" : "Register"}
                  </Badge>
                </>
              ) : settings.caseManagement.action === "register" ? (
                <span className="text-sm text-muted-foreground">New case will be created on submission</span>
              ) : (
                <span className="text-sm text-muted-foreground">No case selected</span>
              )}
            </div>
            {requiresCaseSelection && (
              <Button variant="ghost" size="sm" onClick={() => setShowCaseSelector(true)}>
                <User className="h-4 w-4 mr-1" />
                {selectedCase ? "Change" : "Select Case"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Form Content */}
      {/* Form Content — rely on parent <main> scroller (Index.tsx). Nested
          overflow containers break scrolling on Android WebView where the inner
          flex-1 has no bounded height. */}
      <div className={`flex-1 paper-form ${isFollowUpForm ? "paper-form--bloom" : ""} min-h-[100dvh] w-full`}>
        <div className={isMdaChecklist ? "mx-auto w-full max-w-6xl px-3 py-5 pb-32 sm:px-5 lg:px-8" : "mx-auto w-full max-w-3xl px-3 sm:px-5 py-4 pb-32"}>

          {/* Form Header */}
          {isMdaChecklist ? null : (
            <Card className="border-0 shadow-card mb-4">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
                <CardTitle className="font-display text-xl">{formName || "Untitled Form"}</CardTitle>
                {formDescription && <CardDescription className="text-sm">{formDescription}</CardDescription>}
              </CardHeader>
            </Card>
          )}

          {/* Offline Whisper STT toggle — replaces Web Speech for multilingual offline use */}
          {!isMdaChecklist && ttsEnabled && (
            <div className="mb-2 flex items-center justify-end gap-2">
              <Badge
                variant={whisperEnabled && whisper.isReady ? "default" : "outline"}
                className="text-[10px] gap-1"
              >
                <Mic className="h-3 w-3" />
                {whisperEnabled && whisper.isReady
                  ? `Offline STT: ${whisperLanguage.toUpperCase()}`
                  : "Online STT (browser)"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() => setShowWhisperDialog(true)}
              >
                <Languages className="h-3.5 w-3.5" />
                {whisperEnabled && whisper.isReady ? "Change language" : "Enable offline (HA/YO/IG/EN)"}
              </Button>
            </div>
          )}

          {/* Voice Form Mode Overlay — only when voice/TTS enabled for this form */}
          {!isMdaChecklist && ttsEnabled && (
          <div className="mb-4">
            <VoiceFormOverlay
              isActive={voiceEngine.isActive}
              state={voiceEngine.state}
              currentIndex={voiceEngine.currentIndex}
              totalQuestions={voiceFormQuestions.length}
              currentQuestion={voiceEngine.currentQuestion}
              lastConfidence={voiceEngine.lastConfidence}
              lastPolicy={voiceEngine.lastPolicy}
              isSpellingMode={voiceEngine.isSpellingMode}
              spellingBuffer={voiceEngine.spellingBuffer}
              mode={voiceEngine.mode}
              currentAnswer={voiceEngine.currentQuestion ? responses[voiceEngine.currentQuestion.id] : undefined}
              interimTranscript={voiceInterimText}
              finalTranscript={voiceFinalText}
              onStart={voiceEngine.startEngine}
              onStop={voiceEngine.stopEngine}
              onSetMode={voiceEngine.setMode}
              conversationalEnabled={voiceMode === "conversational" && slm.isReady}
              conversationalProcessing={conversationalProcessing}
              onConversationalCapture={async () => {
                try {
                  // Capture one sentence via Web Speech API, then pass to SLM.
                  const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                  if (!SR) {
                    toast({ title: "Voice not supported", variant: "destructive" });
                    return;
                  }
                  const rec = new SR();
                  rec.continuous = false;
                  rec.interimResults = false;
                  rec.lang = "en-US";
                  rec.maxAlternatives = 1;
                  const sentence: string = await new Promise((resolve, reject) => {
                    rec.onresult = (e: any) => resolve(e.results[0][0].transcript || "");
                    rec.onerror = (e: any) => reject(new Error(e.error || "speech_error"));
                    rec.onend = () => {};
                    try { rec.start(); } catch (err) { reject(err); }
                  });
                  if (!sentence.trim()) return;
                  setConversationalProcessing(true);
                  const extracted = await slm.extractAnswers(sentence, voiceFormQuestions);
                  if (extracted.length === 0) {
                    toast({ title: "No fields detected", description: "Try rephrasing or use standard mode." });
                  } else {
                    setResponses(prev => {
                      const next = { ...prev };
                      for (const e of extracted) next[e.questionId] = e.value;
                      return next;
                    });
                    toast({
                      title: "Conversational extraction",
                      description: `Filled ${extracted.length} field${extracted.length === 1 ? "" : "s"} from your sentence.`,
                    });
                  }
                } catch (err: any) {
                  console.error("Conversational capture failed:", err);
                  toast({ title: "Capture failed", description: err?.message || "Try again.", variant: "destructive" });
                } finally {
                  setConversationalProcessing(false);
                }
              }}
            />
          </div>
          )}



          {/* Validation Errors Summary */}
          {!isMdaChecklist && Object.keys(validationErrors).length > 0 && (
            <Card className="border-destructive/50 bg-destructive/5 mb-4">
              <CardContent className="py-3">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Please fix {Object.keys(validationErrors).length} error(s)</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Questions */}
          {(() => {
            // Count visible non-calculate questions
            const allVisibleQuestions = [
              ...groups.flatMap(g => g.questions.filter(q => shouldShowQuestion(q) && q.type !== "calculate")),
              ...visibleQuestions.filter(q => q.type !== "calculate"),
            ];
            if (allVisibleQuestions.length === 0) {
              return (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No questions in this form.</p>
                  </CardContent>
                </Card>
              );
            }

            // ============================================================
            // Integrated MDA Supervisory Checklist — paginated section view.
            // Renders ONLY the active section's questions, with Previous /
            // Next Section navigation, then the Supervision Summary cards,
            // Quick Actions and Important Reminder — exactly like the mockup.
            // ============================================================
            if (isMdaChecklist && groups.length > 0) {
              const total = groups.length;
              const idx = Math.min(mdaActiveIndex, total - 1);
              const group = groups[idx];
              const isLast = idx === total - 1;
              const isFirst = idx === 0;

              const visibleGroupQuestions = group.questions.filter(shouldShowQuestion);
              const visibleNonCalcRaw = visibleGroupQuestions.filter(q => q.type !== "calculate");
              // The General Information section drives its location fields from
              // the microplan via <MdaLocationCascade>; suppress the raw
              // geography questions so they cannot be free-typed.
              const geoInSection = visibleNonCalcRaw.some(q => q.name && MDA_GEO_NAMES.has(q.name));
              const visibleNonCalc = geoInSection
                ? visibleNonCalcRaw.filter(q => !(q.name && MDA_GEO_NAMES.has(q.name)))
                : visibleNonCalcRaw;
              // Calculate questions are auto-computed in a dedicated effect (see
              // the MDA calc effect) — NOT during render, so navigation stays snappy.

              let mdaCounter = 0;

              const progressPct = Math.round(((idx + 1) / total) * 100);
              const sectionTitle = group.label.replace(/^\s*\d+\.\s*/, "");
              return (
                  <div className="space-y-5">
                  {/* Progress header — single professional command band for exit, status and section tracking */}
                  <div className="mda-command-band overflow-hidden rounded-2xl border p-4 sm:p-5">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
                          <button
                            type="button"
                            onClick={handleMdaExit}
                            className="mda-command-exit inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            aria-label="Exit checklist"
                          >
                            <ArrowLeft className="h-4 w-4" />
                            <span>Exit Form</span>
                          </button>
                          <div className="min-w-0">
                            <p className="mda-command-muted-text text-[11px] font-semibold uppercase tracking-[0.18em]">
                              MDA Supervision · Section {idx + 1} of {total}
                            </p>
                            <h2
                              className="mt-1 text-xl font-bold leading-tight text-inherit sm:text-2xl"
                              dangerouslySetInnerHTML={{ __html: sanitizeHtml(sectionTitle) }}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <span className="mda-command-panel inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold">
                            {isOnline ? (
                              <>
                                <Wifi className="h-3.5 w-3.5 text-status-success" />
                                Online
                              </>
                            ) : (
                              <>
                                <WifiOff className="h-3.5 w-3.5 text-status-warning" />
                                Offline
                              </>
                            )}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mda-command-control min-h-9 gap-1.5 rounded-lg text-xs font-semibold"
                            onClick={() => setInclusiveMode(true)}
                            title="Hearing Impairment Mode — Inclusive data collection"
                          >
                            <HandMetal className="h-4 w-4" />
                            <span className="hidden sm:inline">Inclusive</span>
                          </Button>
                          <span className="mda-command-panel inline-flex min-h-9 items-center rounded-lg px-3">
                            <AuthConfidenceMeter posture={authPosture} />
                          </span>
                          <div className="mda-command-panel flex items-center gap-3 rounded-xl px-4 py-2.5">
                            <span className="text-2xl font-extrabold tabular-nums">{progressPct}%</span>
                            <span className="mda-command-muted-text text-[11px] leading-tight">Checklist<br />complete</span>
                          </div>
                        </div>
                      </div>
                      <div className="mda-command-progress-track h-2 w-full overflow-hidden rounded-full">
                        <div
                          className="mda-command-progress h-full rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="mda-command-muted-text flex items-center justify-between text-[10px]">
                        <span>Start</span>
                        <span>{total} sections</span>
                      </div>
                    </div>
                  </div>

                  {/* Instruction banner — slate/amber accent for clarity */}
                  <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
                      <ClipboardCheck className="h-5 w-5" />
                    </span>
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      Complete each section in order. Fields marked with{" "}
                      <span className="font-semibold text-destructive">*</span> are mandatory.
                      Tap <span className="font-semibold text-indigo-700 dark:text-indigo-300">&lsquo;Next Section&rsquo;</span> to save your progress and continue.
                    </p>
                  </div>

                  {/* Active section card */}
                  <Card className="overflow-hidden border border-slate-200 shadow-sm dark:border-slate-800">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-blue-50 to-transparent px-5 py-4 dark:border-slate-800 dark:from-indigo-950/40 dark:via-blue-950/20">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-sm font-bold text-white shadow-md shadow-indigo-900/20">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Capturing supervision data</p>
                          <h3
                            className="truncate text-base font-bold text-slate-800 dark:text-slate-100 sm:text-lg"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(sectionTitle) }}
                          />
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5 border-indigo-200 text-xs text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
                        onClick={() => toast({ title: "Supervisor Guidelines", description: "Refer to the NTD MDA Supervision Manual for this section." })}
                      >
                        <BookOpen className="h-4 w-4" />
                        <span className="hidden sm:inline">Guidelines</span>
                      </Button>
                    </div>
                    <div className="space-y-3 p-4 sm:p-5">
                      {geoInSection && (
                        <MdaLocationCascade
                          projectId={projectId}
                          responses={responses}
                          nameToId={mdaNameToId}
                          stateScope={(settings as any).mdaStateScope}
                          onSet={(updates) => {
                            userInteractedRef.current = true;
                            setResponses(prev => ({ ...prev, ...updates }));
                          }}
                        />
                      )}
                      {visibleNonCalc.length === 0 && !geoInSection ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">No questions in this section.</p>
                      ) : (
                        visibleNonCalc.map((question) => {
                          if (question.type !== "note") mdaCounter++;
                          return renderQuestionCard(question, mdaCounter, question.id);
                        })
                      )}
                    </div>
                  </Card>

                  {/* Section navigation */}
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      size="lg"
                      disabled={isFirst}
                      onClick={() => goToMdaSection(idx - 1)}
                      className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    {!isLast ? (
                      <Button
                        size="lg"
                        onClick={() => { if (validateMdaSection(idx)) goToMdaSection(idx + 1); }}
                        className="gap-2 bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-md shadow-indigo-900/20 hover:from-indigo-700 hover:to-blue-800"
                      >
                        Next Section
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/20 hover:from-emerald-700 hover:to-teal-700"
                      >
                        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        {isSubmitting ? "Submitting..." : "Submit Checklist"}
                      </Button>
                    )}
                  </div>

                  {/* Quick actions + reminder (Supervision Summary removed per request) */}
                  <MdaQuickActions />
                  <MdaReminder />
                </div>
              );
            }

            let questionCounter = 0;
            return (
              <div className="space-y-4" style={formTheme.enabled ? { gap: "var(--form-field-gap)", display: "flex", flexDirection: "column" } : undefined}>

                {/* Groups */}
                {groups.map((group) => {
                  const isCollapsed = collapsedGroups[group.id];
                  const iterations = group.repeat ? (repeatCounts[group.id] || 1) : 1;
                  const visibleGroupQuestions = group.questions.filter(shouldShowQuestion);
                  const visibleNonCalcAll = visibleGroupQuestions.filter(q => q.type !== "calculate");
                  // Treatment Data Reporting Tools drive geography from the microplan.
                  const geoInGroup = useMicroplanCascade && !group.repeat &&
                    visibleNonCalcAll.some(q => q.name && MDA_GEO_NAMES.has(q.name));
                  const visibleNonCalcQuestions = geoInGroup
                    ? visibleNonCalcAll.filter(q => !(q.name && MDA_GEO_NAMES.has(q.name)))
                    : visibleNonCalcAll;

                  return (
                    <Card key={group.id} id={isMdaChecklist ? `mda-section-${group.id}` : undefined} className="border border-primary/30 overflow-hidden">
                      {/* Group Header */}
                      <button
                        onClick={() => toggleGroupCollapse(group.id)}
                        className="flex w-full items-center justify-between p-4 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                            <Folder className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(group.label) }} />
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{visibleNonCalcQuestions.length} question{visibleNonCalcQuestions.length !== 1 ? "s" : ""}</span>
                              {group.repeat && (
                                <span className="flex items-center gap-1 text-primary">
                                  <Repeat className="h-3 w-3" />
                                  {iterations}{group.repeatCount ? ` / ${group.repeatCount}` : ""} iteration{iterations !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {isCollapsed ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />}
                      </button>

                      {/* Group Content */}
                      {!isCollapsed && (
                        <div className="border-t border-primary/20 p-4 space-y-4 bg-primary/[0.02]">
                          {geoInGroup && (
                            <MdaLocationCascade
                              projectId={projectId}
                              responses={responses}
                              nameToId={mdaNameToId}
                              stateScope={(settings as any).mdaStateScope}
                              onSet={(updates) => {
                                userInteractedRef.current = true;
                                setResponses(prev => ({ ...prev, ...updates }));
                              }}
                            />
                          )}
                          {Array.from({ length: iterations }).map((_, iterIdx) => {
                            return (
                              <div key={iterIdx}>
                                {iterations > 1 && (
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="h-px flex-1 bg-border" />
                                    <span className="text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                                      Iteration {iterIdx + 1}{group.repeatCount ? ` of ${group.repeatCount}` : ""}
                                    </span>
                                    <div className="h-px flex-1 bg-border" />
                                  </div>
                                )}
                                <div className="space-y-3">
                                  {visibleNonCalcQuestions.map((question) => {
                                    // Notes are decorative and not numbered — don't advance the counter.
                                    if (question.type !== "note") questionCounter++;
                                    const qKey = iterations > 1 ? getRepeatKey(question.id, iterIdx) : question.id;
                                    return renderQuestionCard(question, questionCounter, qKey);
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Repeat group controls: single "+" button */}
                          {group.repeat && (
                            <div className="flex flex-col items-center gap-2 pt-3">
                              {/* Add iteration button */}
                              {(!group.repeatCount || iterations < group.repeatCount) ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addIteration(group.id, group.repeatCount)}
                                  className="gap-2 border-primary/40 text-primary hover:bg-primary/5"
                                >
                                  <Plus className="h-4 w-4" />
                                  Add Iteration
                                </Button>
                              ) : (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Ban className="h-4 w-4" />
                                  Maximum {group.repeatCount} iterations reached
                                </div>
                              )}
                              {/* Remove last iteration */}
                              {iterations > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeIteration(group.id)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  − Remove last iteration
                                </Button>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {iterations} iteration{iterations !== 1 ? "s" : ""}{group.repeatCount ? ` of ${group.repeatCount} required` : ""}
                              </span>
                            </div>
                          )}

                          {/* Incomplete iterations reason */}
                          {group.repeat && group.repeatCount && iterations < group.repeatCount && (
                            <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-4 space-y-2">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                                  Only {iterations} of {group.repeatCount} iterations completed
                                </span>
                              </div>
                              <p className="text-xs text-orange-700 dark:text-orange-400">
                                Please provide a reason for not completing all {group.repeatCount} iterations. This is required for submission.
                              </p>
                              <Textarea
                                value={incompleteRepeatReasons[group.id] || ""}
                                onChange={(e) => setIncompleteRepeatReasons(prev => ({ ...prev, [group.id]: e.target.value }))}
                                placeholder="Enter reason for incomplete iterations (required)..."
                                className={`text-sm ${validationErrors[`_repeat_reason_${group.id}`] ? "border-destructive" : ""}`}
                              />
                              {validationErrors[`_repeat_reason_${group.id}`] && (
                                <p className="text-xs text-destructive flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  {validationErrors[`_repeat_reason_${group.id}`]}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}

                {/* Ungrouped Questions */}
                {visibleQuestions.map((question) => {
                  if (question.type === "calculate") {
                    // Compute silently
                    const val = computeCalcValue(question, question.id);
                    if (val !== responses[question.id]) {
                      setTimeout(() => setResponses(prev => ({ ...prev, [question.id]: val })), 0);
                    }
                    return null;
                  }
                  // Notes are decorative and not numbered — don't advance the counter.
                  if (question.type !== "note") questionCounter++;
                  return renderQuestionCard(question, questionCounter);
                })}

                {/* Follow-up modules are NOT shown during registration. They live
                    on the Cases page and activate once registration is finalized. */}

                {/* MDA Supervisory Checklist insight panels (Supervision Summary removed per request) */}
                {isMdaChecklist && (
                  <div className="space-y-4">
                    <MdaQuickActions />
                    <MdaReminder />
                  </div>
                )}


                {/* Field Notes & Audio Verification */}
                <Card className="border-0 shadow-soft">
                  <CardContent className="pt-5 space-y-4">
                    {/* Background audio verification - hidden from user */}

                    {/* Field Challenge Notes */}
                    <div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 mb-2"
                        onClick={() => setShowFieldNotes(!showFieldNotes)}
                      >
                        <FileText className="h-4 w-4" />
                        {showFieldNotes ? "Hide" : "Add"} Field Challenge Notes
                      </Button>
                      {showFieldNotes && (
                        <Textarea
                          value={fieldNotes}
                          onChange={(e) => setFieldNotes(e.target.value)}
                          placeholder="Describe any field challenges, access issues, or observations before submitting..."
                          className="text-sm"
                          rows={3}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div data-mda-submit className="pt-4 pb-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
                  {localWorkflow ? (
                    <div className="flex flex-col gap-3">
                      <Button
                        variant="acg"
                        className="w-full min-h-[52px] text-base font-semibold"
                        size="lg"
                        onClick={handleFinalizeLocal}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : (
                          <CheckCircle className="mr-2 h-5 w-5" />
                        )}
                        {savedEntry?.status === "finalized" ? "Update & Re-Finalize" : "Finalize Form"}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full min-h-[48px] text-base font-semibold"
                        size="lg"
                        onClick={handleSaveLocalDraft}
                        disabled={isSubmitting}
                      >
                        <Save className="mr-2 h-5 w-5" />
                        Save Form As Draft
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="acg"
                      className="w-full min-h-[52px] text-base font-semibold"
                      size="lg"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-5 w-5" />
                      )}
                      {isSubmitting ? "Submitting..." : "Submit Form"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Incomplete Iterations Confirmation Dialog */}
      <AlertDialog open={showIncompleteConfirm} onOpenChange={setShowIncompleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit with Incomplete Iterations?</AlertDialogTitle>
            <AlertDialogDescription>
              {getIncompleteRepeatGroups().map(g => (
                <div key={g.id} className="mb-2">
                  <strong>{g.label}</strong>: {repeatCounts[g.id] || 1} of {g.repeatCount} iterations completed.
                  <br />
                  <span className="text-sm italic">Reason: {incompleteRepeatReasons[g.id]}</span>
                </div>
              ))}
              <p className="mt-2">Are you sure you want to submit without completing all required iterations?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit}>Yes, Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Case Selector Dialog */}
      <CaseSelector
        open={showCaseSelector}
        onOpenChange={setShowCaseSelector}
        projectId={projectId}
        caseTypeId={settings.caseManagement?.caseTypeId}
        onSelectCase={(caseData) => {
          setSelectedCase({
            id: caseData.id,
            name: caseData.name,
            properties: caseData.properties,
          });
        }}
      />

      {/* Text-to-Speech Accessibility Prompt */}
      {showTTSPrompt && (
        <TextToSpeechPrompt
          formName={formName}
          onConfirm={(enabled) => {
            setTtsEnabled(enabled);
            setShowTTSPrompt(false);
            // If admin enabled conversational voice, ask the user to opt in.
            if (enabled && settings.conversationalVoice) {
              setShowConversationalDialog(true);
            }
            // Auto-read all questions from the beginning when TTS is enabled
            if (enabled) {
              setTimeout(() => {
                const infos: { id: string; label: string; type: string; options?: string[]; required?: boolean }[] = [];
                groups.forEach(g => {
                  g.questions.filter(q => shouldShowQuestion(q) && q.type !== "calculate").forEach(q => {
                    infos.push({ id: q.id, label: q.label, type: q.type, options: q.options?.map(o => o.label), required: q.required });
                  });
                });
                visibleQuestions.filter(q => q.type !== "calculate").forEach(q => {
                  infos.push({ id: q.id, label: q.label, type: q.type, options: q.options?.map(o => o.label), required: q.required });
                });
                if (infos.length > 0) {
                  speakFromIndex(infos, 0);
                }
              }, 500);
            }
          }}
        />
      )}

      {/* Conversational Voice (in-app SLM) opt-in */}
      <ConversationalVoiceDialog
        open={showConversationalDialog}
        onClose={() => setShowConversationalDialog(false)}
        onChoose={(choice) => setVoiceMode(choice)}
        status={slm.status}
        progress={slm.progress}
        error={slm.error}
        isSupported={slm.isSupported}
        onLoadModel={slm.loadModel}
      />

      {/* Offline Whisper STT — multilingual offline speech recognition */}
      <OfflineWhisperDialog
        open={showWhisperDialog}
        onClose={() => setShowWhisperDialog(false)}
        onReady={(lang) => {
          setWhisperLanguage(lang);
          setWhisperEnabled(true);
          try { localStorage.setItem("whisperLang", lang); } catch { /* noop */ }
          toast({
            title: "Offline speech enabled",
            description: `Whisper is now handling voice input in ${lang.toUpperCase()}.`,
          });
        }}
        status={whisper.status}
        progress={whisper.progress}
        error={whisper.error}
        isSupported={whisper.isSupported}
        onLoadModel={whisper.loadModel}
        initialLanguage={whisperLanguage}
      />

      {/* Resume from crash / battery death */}
      <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume where you left off?</AlertDialogTitle>
            <AlertDialogDescription>
              We saved your progress on this form
              {pendingDraft?.savedAt
                ? ` (last saved ${new Date(pendingDraft.savedAt).toLocaleString()})`
                : ""}
              . Would you like to resume, or start fresh?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                // Start fresh — discard saved draft
                localStorage.removeItem(draftKey);
                try { localStorage.removeItem(ACTIVE_FORM_FILL_KEY); } catch {}
                window.dispatchEvent(new Event("amehnities:form-progress-changed"));
                setPendingDraft(null);
                setShowResumeDialog(false);
                toast({ title: "Starting fresh", description: "Previous progress discarded." });
              }}
            >
              Start Fresh
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDraft) {
                  setResponses(pendingDraft.responses || {});
                  if (pendingDraft.gpsPosition) setGpsPosition(pendingDraft.gpsPosition);
                  toast({
                    title: "Progress restored",
                    description: `Picked up from ${new Date(pendingDraft.savedAt).toLocaleString()}`,
                  });
                }
                setShowResumeDialog(false);
              }}
            >
              Resume
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Thank-you from Ameh Joseph */}
      <ThankYouDialog
        open={showThankYou}
        offline={lastSubmissionOffline}
        formName={formName}
        submitterName={profile?.first_name}
        onClose={() => {
          setShowThankYou(false);
          onClose();
        }}
      />

      {/* MDA → Coverage Evaluation 3D opt-in (shared post-submit flow) */}
      <AlertDialog open={showCoverageOptIn} onOpenChange={setShowCoverageOptIn}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <img src={fgnEmblem} alt="" className="h-9 w-9 object-contain" />
              <AlertDialogTitle>Supervision recorded — proceed to Coverage Evaluation?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Your MDA supervisory checklist was submitted successfully. You can now
              run the linked Coverage Evaluation Survey (3D) for this community to
              independently verify treatment coverage, or finish for now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowCoverageOptIn(false);
                onClose();
              }}
            >
              Finish for now
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowCoverageOptIn(false);
                // Carry the supervisory checklist's location identification across
                // to the Coverage Evaluation 3D page, where it will be prefilled
                // and locked (not user-editable).
                try {
                  const answer = (...names: string[]) => {
                    for (const name of names) {
                      const direct = responses[name];
                      if (direct !== undefined && direct !== null && String(direct).trim() !== "") return direct;
                      const id = nameToIdMap[name];
                      const byId = id ? responses[id] : undefined;
                      if (byId !== undefined && byId !== null && String(byId).trim() !== "") return byId;
                    }
                    return "";
                  };
                  const handoffGps = gpsQuestionAnswer || gpsPosition || locEnforcement.autoGps || backgroundLocation || null;
                  const url = buildCesLocationUrl({
                    state: answer("state", "state_name", "admin_state"),
                    lga: answer("lga", "lga_name", "local_government", "local_government_area"),
                    ward: answer("ward", "ward_name"),
                    flhf_name: answer("flhf_name", "flhf", "health_facility", "facility", "facility_name"),
                    community_name: answer("community_name", "community"),
                    settlement_name: answer("settlement_name", "settlement"),
                    ...(handoffGps ? { lat: handoffGps.lat, lng: handoffGps.lng, accuracy: (handoffGps as any).accuracy } : {}),
                    projectId: projectId ?? "",
                    formId,
                    source: "mda_checklist",
                    ts: Date.now(),
                  });
                  window.dispatchEvent(new CustomEvent("amehnities:navigate-tab", { detail: { tab: "coverage-eval" } }));
                  navigate(url, { replace: true });
                  requestAnimationFrame(() => onClose());
                  return;
                } catch { /* fall back to plain tab navigation */ }
                window.dispatchEvent(new CustomEvent("amehnities:navigate-tab", { detail: { tab: "coverage-eval" } }));
                navigate("/?tab=coverage-eval", { replace: true });
                requestAnimationFrame(() => onClose());
              }}
            >
              Proceed with Coverage Evaluation 3D
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Leave without saving confirmation */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved answers on this form. If you leave now, your
              changes will be lost. Save it as a draft first to continue later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            {localWorkflow && (
              <Button
                variant="outline"
                onClick={async () => {
                  setShowLeaveConfirm(false);
                  await handleSaveLocalDraft();
                }}
              >
                Save as draft
              </Button>
            )}
            <AlertDialogAction
              onClick={() => {
                setShowLeaveConfirm(false);
                onClose();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

/**
 * Wrap the FormFiller in MoEExpertProvider so the in-browser ~200M expert
 * model loads ONCE per form session and is shared across every field's
 * inline ExpertFieldValidator (math / language / validation).
 */
const FormFillerWithExperts = (props: React.ComponentProps<typeof FormFiller>) => (
  <MoEExpertProvider>
    <FormFiller {...props} />
  </MoEExpertProvider>
);

export default FormFillerWithExperts;
