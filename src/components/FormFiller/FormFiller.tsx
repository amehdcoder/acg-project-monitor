import { useState, useEffect, useCallback, useMemo } from "react";
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
// ScrollArea removed — native overflow-y-auto for reliable mobile scrolling
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
  Repeat,
  Folder,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import useGeolocation, { GeolocationPosition } from "@/hooks/useGeolocation";
import useGeofenceValidation from "@/hooks/useGeofenceValidation";
import { supabase } from "@/integrations/supabase/client";
import useCaseManagement, { CaseManagementSettings } from "@/hooks/useCaseManagement";
import GPSCapture from "./GPSCapture";
import PhotoCapture from "./PhotoCapture";
import SignatureCapture from "./SignatureCapture";
import AudioCapture from "./AudioCapture";
import BarcodeScanner from "./BarcodeScanner";
import CaseSelector from "./CaseSelector";

interface FormSettings {
  allowAnonymous?: boolean;
  requireLocation?: boolean;
  offlineEnabled?: boolean;
  autoSave?: boolean;
  enforceGeofence?: boolean;
  autoSaveInterval?: number;
  caseManagement?: CaseManagementSettings;
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
}

const FormFiller = ({
  formId,
  formName,
  formDescription,
  questions,
  groups = [],
  geofence,
  userId,
  projectId,
  requireLocation = true,
  settings = {},
  initialCase,
  onClose,
  onSubmitSuccess,
}: FormFillerProps) => {
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [gpsPosition, setGpsPosition] = useState<GeolocationPosition | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [showCaseSelector, setShowCaseSelector] = useState(false);
  const [userGeofence, setUserGeofence] = useState<any>(undefined);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    groups.forEach(g => {
      if (g.repeat) counts[g.id] = g.repeatCount || 1;
    });
    return counts;
  });
  const [incompleteRepeatReasons, setIncompleteRepeatReasons] = useState<Record<string, string>>({});
  const [showRepeatReasonFor, setShowRepeatReasonFor] = useState<string | null>(null);
  const [userGeofenceLoaded, setUserGeofenceLoaded] = useState(false);

  const { isOnline, pendingCount, saveSubmission } = useOfflineStorage();
  
  // Fetch user-specific geofence assignment (takes priority over form-level geofence)
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
          // No user-specific assignment — no geofence enforcement per user's preference
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

  // Use user-specific geofence if assigned, otherwise no enforcement
  const effectiveGeofence = userGeofenceLoaded ? userGeofence : undefined;
  const { validatePosition, isGeofenceEnabled, normalizedGeofence } = useGeofenceValidation(effectiveGeofence);
  const { getCurrentPosition, isLoading: isGpsLoading } = useGeolocation();
  
  // Case management integration
  const {
    selectedCase,
    setSelectedCase,
    requiresCaseSelection,
    getPrePopulatedResponses,
    processCaseAction,
    loading: caseLoading,
  } = useCaseManagement(settings.caseManagement, userId, projectId);

  // Computed settings with defaults
  const effectiveRequireLocation = settings.requireLocation ?? requireLocation;
  const effectiveAutoSave = settings.autoSave ?? true;
  // Auto-enable geofence enforcement when a geofence boundary is active
  const effectiveEnforceGeofence = settings.enforceGeofence ?? isGeofenceEnabled ?? false;
  const autoSaveInterval = settings.autoSaveInterval ?? 30;

  // Set initial case if provided
  useEffect(() => {
    if (initialCase && !selectedCase) {
      setSelectedCase(initialCase);
    }
  }, [initialCase]);

  // Show case selector on mount if required and no initial case
  useEffect(() => {
    if (requiresCaseSelection && !selectedCase && !initialCase) {
      setShowCaseSelector(true);
    }
  }, [requiresCaseSelection, selectedCase, initialCase]);

  // Pre-populate responses from case properties when case is selected
  useEffect(() => {
    if (selectedCase) {
      const prePopulated = getPrePopulatedResponses();
      if (Object.keys(prePopulated).length > 0) {
        setResponses((prev) => ({ ...prePopulated, ...prev }));
      }
    }
  }, [selectedCase, getPrePopulatedResponses]);

  // Auto-capture GPS on mount if required
  useEffect(() => {
    if (effectiveRequireLocation && !gpsPosition) {
      getCurrentPosition();
    }
  }, [effectiveRequireLocation]);

  // Auto-save functionality
  useEffect(() => {
    if (!effectiveAutoSave || Object.keys(responses).length === 0) return;

    const interval = setInterval(() => {
      // Save draft to localStorage
      const draft = {
        formId,
        responses,
        gpsPosition,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(`form_draft_${formId}`, JSON.stringify(draft));
      setLastAutoSave(new Date());
    }, autoSaveInterval * 1000);

    return () => clearInterval(interval);
  }, [effectiveAutoSave, autoSaveInterval, responses, gpsPosition, formId]);

  // Load draft on mount
  useEffect(() => {
    const draftKey = `form_draft_${formId}`;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.responses && Object.keys(draft.responses).length > 0) {
          setResponses(draft.responses);
          if (draft.gpsPosition) {
            setGpsPosition(draft.gpsPosition);
          }
          toast({
            title: "Draft Restored",
            description: `Restored progress from ${new Date(draft.savedAt).toLocaleString()}`,
          });
        }
      } catch (e) {
        console.error("Failed to restore draft:", e);
      }
    }
  }, [formId]);

  // Validate geofence position
  const geofenceValidation = useMemo(() => {
    if (!gpsPosition || !isGeofenceEnabled) return null;
    return validatePosition(gpsPosition.lat, gpsPosition.lng);
  }, [gpsPosition, isGeofenceEnabled, validatePosition]);

  const updateResponse = (questionId: string, value: any) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
    // Clear validation error when user provides value
    if (validationErrors[questionId]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    }
  };

  // Build a lookup map from XLSForm name to question id (for resolving ${name} references)
  const nameToIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    const allQuestions = [...questions, ...groups.flatMap(g => g.questions)];
    for (const q of allQuestions) {
      if (q.name) map[q.name] = q.id;
      // Also map by id for backward compat
      map[q.id] = q.id;
    }
    return map;
  }, [questions, groups]);

  // Resolve ${name} references in an expression to actual response values
  const resolveExpression = useCallback((expr: string): string => {
    return expr.replace(/\$\{(.+?)\}/g, (_, name) => {
      const qId = nameToIdMap[name];
      if (qId && responses[qId] !== undefined && responses[qId] !== null) {
        return String(responses[qId]);
      }
      return "";
    });
  }, [nameToIdMap, responses]);

  const shouldShowQuestion = (question: Question): boolean => {
    if (!question.relevant) return true;

    const relevantExpr = question.relevant;

    // Handle common ODK relevant expressions:
    // ${name} = 'value', ${name} != 'value', ${name} > value, selected(${name}, 'value')
    
    // Try: selected(${name}, 'value')
    const selectedMatch = relevantExpr.match(/selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)/);
    if (selectedMatch) {
      const [, refName, expectedValue] = selectedMatch;
      const qId = nameToIdMap[refName];
      if (qId) {
        const val = responses[qId];
        if (Array.isArray(val)) return val.includes(expectedValue);
        return String(val || "") === expectedValue;
      }
      return false;
    }

    // Try: ${name} = 'value' or ${name} != 'value'
    const eqMatch = relevantExpr.match(/\$\{(.+?)\}\s*(=|!=)\s*['"](.+?)['"]/);
    if (eqMatch) {
      const [, refName, operator, expectedValue] = eqMatch;
      const qId = nameToIdMap[refName];
      if (qId) {
        const val = String(responses[qId] || "");
        if (operator === "=") return val === expectedValue;
        if (operator === "!=") return val !== expectedValue;
      }
      return operator === "!="; // If ref not found, != returns true
    }

    // Try: ${name} > value, ${name} < value, ${name} >= value, ${name} <= value
    const numMatch = relevantExpr.match(/\$\{(.+?)\}\s*(>=?|<=?)\s*(-?\d+(?:\.\d+)?)/);
    if (numMatch) {
      const [, refName, operator, numStr] = numMatch;
      const qId = nameToIdMap[refName];
      if (qId) {
        const val = parseFloat(String(responses[qId] || "0"));
        const num = parseFloat(numStr);
        if (operator === ">") return val > num;
        if (operator === ">=") return val >= num;
        if (operator === "<") return val < num;
        if (operator === "<=") return val <= num;
      }
      return false;
    }

    // Try: ${name} (truthy check - show if value exists)
    const truthyMatch = relevantExpr.match(/^\$\{(.+?)\}$/);
    if (truthyMatch) {
      const qId = nameToIdMap[truthyMatch[1]];
      if (qId) {
        const val = responses[qId];
        return val !== undefined && val !== null && val !== "" && val !== false;
      }
      return false;
    }

    // Fallback: show the question
    return true;
  };

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    const visibleQuestions = questions.filter(shouldShowQuestion);

    for (const question of visibleQuestions) {
      const value = responses[question.id];

      // Required field validation
      if (question.required) {
        if (value === undefined || value === null || value === "") {
          errors[question.id] =
            question.constraintMessage || "This field is required";
          continue;
        }
        if (Array.isArray(value) && value.length === 0) {
          errors[question.id] =
            question.constraintMessage || "Please select at least one option";
          continue;
        }
      }

      // Skip further validation if empty and not required
      if (value === undefined || value === null || value === "") continue;

      // Number validation
      if (question.type === "number" && question.validation) {
        const numValue = parseFloat(value);
        if (question.validation.min !== undefined && numValue < question.validation.min) {
          errors[question.id] = `Value must be at least ${question.validation.min}`;
        }
        if (question.validation.max !== undefined && numValue > question.validation.max) {
          errors[question.id] = `Value must be at most ${question.validation.max}`;
        }
      }

      // Regex validation
      if (question.validation?.regex) {
        const regex = new RegExp(question.validation.regex);
        if (!regex.test(String(value))) {
          errors[question.id] =
            question.constraintMessage || "Invalid format";
        }
      }
    }

    // Validate repeat group iterations - check if required iterations are completed
    // and require a reason if not all iterations were filled
    for (const group of groups) {
      if (group.repeat && group.repeatCount) {
        const currentCount = repeatCounts[group.id] || 1;
        if (currentCount < group.repeatCount) {
          // Iterations reduced — need a reason
          if (!incompleteRepeatReasons[group.id]?.trim()) {
            errors[`_repeat_reason_${group.id}`] = `Please provide a reason for completing only ${currentCount} of ${group.repeatCount} iterations for "${group.label}"`;
          }
        }
      }
    }

    // Also validate repeated question fields
    for (const group of groups) {
      if (!group.repeat) continue;
      const iterations = repeatCounts[group.id] || group.repeatCount || 1;
      const visibleGroupQuestions = group.questions.filter(shouldShowQuestion);
      for (let iterIdx = 0; iterIdx < iterations; iterIdx++) {
        for (const question of visibleGroupQuestions) {
          const qKey = iterations > 1 ? getRepeatKey(question.id, iterIdx) : question.id;
          const value = responses[qKey];
          if (question.required && (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0))) {
            errors[qKey] = question.constraintMessage || "This field is required";
          }
        }
      }
    }

    // GPS validation
    if (effectiveRequireLocation && !gpsPosition) {
      errors["_gps"] = "GPS location is required";
    }

    // Geofence validation - only block if enforceGeofence is true
    if (effectiveEnforceGeofence && geofenceValidation && !geofenceValidation.isWithinGeofence) {
      errors["_geofence"] = geofenceValidation.message;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [questions, responses, gpsPosition, effectiveRequireLocation, effectiveEnforceGeofence, geofenceValidation, groups, repeatCounts, incompleteRepeatReasons]);

  const handleSaveDraft = async () => {
    const draft = {
      formId,
      responses,
      gpsPosition,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(`form_draft_${formId}`, JSON.stringify(draft));
    setLastAutoSave(new Date());
    toast({
      title: "Draft Saved",
      description: "Your form has been saved locally.",
    });
  };

  const clearDraft = () => {
    localStorage.removeItem(`form_draft_${formId}`);
  };

  const handleSubmit = async () => {
    // For update/close actions, suggest case selection but don't block if none available
    // The useCaseManagement hook will auto-register a new case if none is selected
    if (requiresCaseSelection && !selectedCase) {
      // Only block if there are cases available to select
      // Otherwise, allow auto-registration
      console.log("No case selected for update/close action — will auto-register if needed");
    }

    if (!validateForm()) {
      toast({
        title: "Validation Failed",
        description: "Please fix the errors before submitting.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Determine submission type based on case management settings
      let submissionType = "regular";
      if (settings.caseManagement?.enabled) {
        if (settings.caseManagement.action === "register") {
          submissionType = "registration";
        } else if (settings.caseManagement.action === "update" || settings.caseManagement.action === "close") {
          submissionType = "follow_up";
        }
      }

      const result = await saveSubmission(
        formId,
        userId,
        responses,
        gpsPosition ? { lat: gpsPosition.lat, lng: gpsPosition.lng } : null,
        geofenceValidation?.isWithinGeofence ?? null,
        submissionType
      );

      if (result.success) {
        // Process case management action
        if (settings.caseManagement?.enabled) {
          await processCaseAction(formId, responses, result.id);
        }

        // Clear draft on successful submission
        clearDraft();
        toast({
          title: result.offline ? "Saved Offline" : "Form Submitted",
          description: result.offline
            ? "Your form has been saved and will sync when online."
            : "Your form has been submitted successfully.",
        });
        onSubmitSuccess?.(result.id);
        onClose();
      }
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Submission Failed",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const visibleQuestions = questions.filter(shouldShowQuestion);

  // Build a question-level key for repeat iterations: questionId__iterationIndex
  const getRepeatKey = (questionId: string, iteration: number) => `${questionId}__${iteration}`;

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderQuestionCard = (question: Question, questionNumber: number, keyPrefix = "") => {
    const qKey = keyPrefix || question.id;
    const error = validationErrors[qKey];
    const value = responses[qKey];
    return (
      <Card
        key={qKey}
        className={`border-0 shadow-soft ${error ? "ring-1 ring-destructive" : ""}`}
      >
        <CardContent className="pt-5">
          <div className="space-y-3">
              <div className="flex items-start gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {questionNumber}
              </span>
              <div className="flex-1">
                <Label className="text-base font-medium">
                  <span dangerouslySetInnerHTML={{ __html: question.label }} />
                  {question.required && <span className="ml-1 text-destructive">*</span>}
                </Label>
                {question.hint && (
                  <p className="mt-1 text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: question.hint }} />
                )}
              </div>
            </div>
            <div className="ml-8">
              {renderQuestionInputWithKey(question, qKey)}
              {error && (
                <p className="mt-2 text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {error}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderQuestionInputWithKey = (question: Question, qKey: string) => {
    // Clone renderQuestionInput but use qKey for responses
    const value = responses[qKey];
    const error = validationErrors[qKey];
    const update = (val: any) => {
      setResponses(prev => ({ ...prev, [qKey]: val }));
      if (validationErrors[qKey]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qKey]; return u; });
      }
    };

    switch (question.type) {
      case "calculate": {
        // Auto-compute calculation expression
        const calcExpr = question.calculation || "";
        let computedValue = "";
        if (calcExpr) {
          try {
            // Replace ${name} with actual values
            const resolved = calcExpr.replace(/\$\{(.+?)\}/g, (_, name) => {
              const qId = nameToIdMap[name];
              if (qId && responses[qId] !== undefined && responses[qId] !== null) {
                const v = responses[qId];
                // For GPS, extract lat/lng
                if (typeof v === "object" && v.lat !== undefined) return String(v.lat);
                return String(v);
              }
              return "0";
            });
            // Try to evaluate as a math expression
            try {
              // Only evaluate if it looks like a math expression (numbers and operators)
              if (/^[\d\s+\-*/().]+$/.test(resolved.trim())) {
                computedValue = String(Function('"use strict"; return (' + resolved + ')')());
              } else {
                computedValue = resolved;
              }
            } catch {
              computedValue = resolved;
            }
          } catch {
            computedValue = calcExpr;
          }
          // Auto-update response
          if (computedValue !== responses[qKey]) {
            setTimeout(() => update(computedValue), 0);
          }
        }
        return (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm font-mono text-muted-foreground">
              {calcExpr && <span className="text-xs block mb-1 opacity-60">= {calcExpr}</span>}
              <span className="text-foreground font-medium">{computedValue || "—"}</span>
            </p>
          </div>
        );
      }
      case "text":
      case "number":
        return <Input type="number" value={value || ""} onChange={(e) => update(e.target.value)} placeholder="Enter a number" min={question.validation?.min} max={question.validation?.max} className={error ? "border-destructive" : ""} />;
      case "note":
        return <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">{question.hint || "This is an informational note."}</div>;
      case "select_one":
        return (
          <RadioGroup value={value || ""} onValueChange={(val) => update(val)}>
            {question.options?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={`${qKey}-${option.id}`} />
                <Label htmlFor={`${qKey}-${option.id}`}>{option.label}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      case "select_multiple":
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`${qKey}-${option.id}`}
                  checked={(value || []).includes(option.value)}
                  onCheckedChange={(checked) => {
                    const current = value || [];
                    update(checked ? [...current, option.value] : current.filter((v: string) => v !== option.value));
                  }}
                />
                <Label htmlFor={`${qKey}-${option.id}`}>{option.label}</Label>
              </div>
            ))}
          </div>
        );
      case "date":
        return <Input type="date" value={value || ""} onChange={(e) => update(e.target.value)} className={error ? "border-destructive" : ""} />;
      case "time":
        return <Input type="time" value={value || ""} onChange={(e) => update(e.target.value)} className={error ? "border-destructive" : ""} />;
      case "datetime":
        return <Input type="datetime-local" value={value || ""} onChange={(e) => update(e.target.value)} className={error ? "border-destructive" : ""} />;
      case "range":
        return (
          <div className="space-y-2">
            <Slider value={[value || question.validation?.min || 0]} onValueChange={([val]) => update(val)} min={question.validation?.min || 0} max={question.validation?.max || 100} step={1} />
            <p className="text-center text-sm text-muted-foreground">Value: {value || question.validation?.min || 0}</p>
          </div>
        );
      case "geopoint":
        return <GPSCapture value={value || gpsPosition} onChange={(pos) => { update(pos); if (pos) setGpsPosition(pos); }} geofenceValidation={geofenceValidation} />;
      case "image":
        return <PhotoCapture value={value} onChange={(photo) => update(photo)} />;
      case "audio":
        return <AudioCapture value={value} onChange={(audio) => update(audio)} />;
      case "signature":
        return <SignatureCapture value={value} onChange={(sig) => update(sig)} />;
      case "barcode":
        return <BarcodeScanner value={value} onChange={(code) => update(code)} />;
      case "acknowledge":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox id={qKey} checked={value || false} onCheckedChange={(checked) => update(checked)} />
            <Label htmlFor={qKey}>I acknowledge</Label>
          </div>
        );
      default:
        return <Textarea value={value || ""} onChange={(e) => update(e.target.value)} placeholder="Enter your response" className={error ? "border-destructive" : ""} />;
    }
  };

  const renderQuestionInput = (question: Question) => {
    const value = responses[question.id];
    const error = validationErrors[question.id];

    switch (question.type) {
      case "calculate": {
        const calcExpr = question.calculation || "";
        let computedValue = "";
        if (calcExpr) {
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
              if (/^[\d\s+\-*/().]+$/.test(resolved.trim())) {
                computedValue = String(Function('"use strict"; return (' + resolved + ')')());
              } else {
                computedValue = resolved;
              }
            } catch {
              computedValue = resolved;
            }
          } catch {
            computedValue = calcExpr;
          }
          if (computedValue !== responses[question.id]) {
            setTimeout(() => updateResponse(question.id, computedValue), 0);
          }
        }
        return (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm font-mono text-muted-foreground">
              {calcExpr && <span className="text-xs block mb-1 opacity-60">= {calcExpr}</span>}
              <span className="text-foreground font-medium">{computedValue || "—"}</span>
            </p>
          </div>
        );
      }

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
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            {question.hint || "This is an informational note."}
          </div>
        );

      case "select_one":
        return (
          <RadioGroup
            value={value || ""}
            onValueChange={(val) => updateResponse(question.id, val)}
          >
            {question.options?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={`${question.id}-${option.id}`} />
                <Label htmlFor={`${question.id}-${option.id}`}>{option.label}</Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "select_multiple":
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`${question.id}-${option.id}`}
                  checked={(value || []).includes(option.value)}
                  onCheckedChange={(checked) => {
                    const current = value || [];
                    if (checked) {
                      updateResponse(question.id, [...current, option.value]);
                    } else {
                      updateResponse(
                        question.id,
                        current.filter((v: string) => v !== option.value)
                      );
                    }
                  }}
                />
                <Label htmlFor={`${question.id}-${option.id}`}>{option.label}</Label>
              </div>
            ))}
          </div>
        );

      case "date":
        return (
          <Input
            type="date"
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            className={error ? "border-destructive" : ""}
          />
        );

      case "time":
        return (
          <Input
            type="time"
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            className={error ? "border-destructive" : ""}
          />
        );

      case "datetime":
        return (
          <Input
            type="datetime-local"
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            className={error ? "border-destructive" : ""}
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
            value={value || gpsPosition}
            onChange={(pos) => {
              updateResponse(question.id, pos);
              if (pos) setGpsPosition(pos);
            }}
            geofenceValidation={geofenceValidation}
          />
        );

      case "image":
        return (
          <PhotoCapture
            value={value}
            onChange={(photo) => updateResponse(question.id, photo)}
          />
        );

      case "audio":
        return (
          <AudioCapture
            value={value}
            onChange={(audio) => updateResponse(question.id, audio)}
          />
        );

      case "signature":
        return (
          <SignatureCapture
            value={value}
            onChange={(sig) => updateResponse(question.id, sig)}
          />
        );

      case "barcode":
        return (
          <BarcodeScanner
            value={value}
            onChange={(code) => updateResponse(question.id, code)}
          />
        );

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

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-lg font-bold text-foreground">
              {formName || "Form"}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {isOnline ? (
                <Badge variant="outline" className="text-xs">
                  <Wifi className="h-3 w-3 mr-1 text-green-500" />
                  Online
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  <WifiOff className="h-3 w-3 mr-1 text-orange-500" />
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
        <Button variant="ghost" size="sm" onClick={handleSaveDraft}>
          <Save className="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>

      {/* GPS & Geofence Status Bar */}
      {(effectiveRequireLocation || isGeofenceEnabled) && (
        <div className="border-b border-border bg-muted/30 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* GPS Status */}
              <div className="flex items-center gap-2">
                {isGpsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : gpsPosition ? (
                  <MapPin className="h-4 w-4 text-green-500" />
                ) : (
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-xs text-muted-foreground">
                  {isGpsLoading
                    ? "Getting location..."
                    : gpsPosition
                    ? `±${Math.round(gpsPosition.accuracy)}m accuracy`
                    : "No GPS"}
                </span>
              </div>

              {/* Geofence Status */}
              {isGeofenceEnabled && gpsPosition && geofenceValidation && (
                <div className="flex items-center gap-2">
                  {geofenceValidation.isWithinGeofence ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span
                    className={`text-xs ${
                      geofenceValidation.isWithinGeofence
                        ? "text-green-600"
                        : "text-destructive"
                    }`}
                  >
                    {geofenceValidation.isWithinGeofence
                      ? "In zone"
                      : `${geofenceValidation.distance}m outside`}
                  </span>
                </div>
              )}
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
              <p className="text-sm font-medium text-destructive">
                Submission Blocked — Outside Geofence
              </p>
              <p className="text-xs text-destructive/80">
                {geofenceValidation.message}. You must be within the designated area to submit this form.
              </p>
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
                    {settings.caseManagement.action === "update"
                      ? "Follow-up"
                      : settings.caseManagement.action === "close"
                      ? "Close"
                      : "Register"}
                  </Badge>
                </>
              ) : settings.caseManagement.action === "register" ? (
                <span className="text-sm text-muted-foreground">
                  New case will be created on submission
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  No case selected
                </span>
              )}
            </div>
            {requiresCaseSelection && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCaseSelector(true)}
              >
                <User className="h-4 w-4 mr-1" />
                {selectedCase ? "Change" : "Select Case"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch">
        <div className="mx-auto max-w-2xl p-4 pb-24">
          {/* Form Header */}
          <Card className="border-0 shadow-card mb-4">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
              <CardTitle className="font-display text-xl">
                {formName || "Untitled Form"}
              </CardTitle>
              {formDescription && (
                <CardDescription className="text-sm">
                  {formDescription}
                </CardDescription>
              )}
            </CardHeader>
          </Card>

          {/* Validation Errors Summary */}
          {Object.keys(validationErrors).length > 0 && (
            <Card className="border-destructive/50 bg-destructive/5 mb-4">
              <CardContent className="py-3">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Please fix {Object.keys(validationErrors).length} error(s)
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Questions - Groups first, then ungrouped */}
          {(() => {
            const totalQuestions = groups.reduce((s, g) => s + g.questions.length, 0) + visibleQuestions.length;
            if (totalQuestions === 0) {
              return (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No questions in this form.</p>
                  </CardContent>
                </Card>
              );
            }

            let questionCounter = 0;
            return (
              <div className="space-y-4">
                {/* Render Groups as collapsible containers */}
                {groups.map((group) => {
                  const isCollapsed = collapsedGroups[group.id];
                  const iterations = group.repeat ? (repeatCounts[group.id] || group.repeatCount || 1) : 1;
                  const visibleGroupQuestions = group.questions.filter(shouldShowQuestion);
                  const groupStartNum = questionCounter + 1;
                  
                  return (
                    <Card key={group.id} className="border border-primary/30 overflow-hidden">
                      {/* Group Header - Collapsible trigger */}
                      <button
                        onClick={() => toggleGroupCollapse(group.id)}
                        className="flex w-full items-center justify-between p-4 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                            <Folder className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{group.label}</h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{visibleGroupQuestions.length} question{visibleGroupQuestions.length !== 1 ? "s" : ""}</span>
                              {group.repeat && (
                                <span className="flex items-center gap-1 text-primary">
                                  <Repeat className="h-3 w-3" />
                                  {iterations} iteration{iterations !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {isCollapsed ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>

                      {/* Group Content */}
                      {!isCollapsed && (
                        <div className="border-t border-primary/20 p-4 space-y-4 bg-primary/[0.02]">
                          {/* Repeat group iterations */}
                          {Array.from({ length: iterations }).map((_, iterIdx) => {
                            return (
                              <div key={iterIdx}>
                                {iterations > 1 && (
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="h-px flex-1 bg-border" />
                                    <span className="text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                                      Iteration {iterIdx + 1} of {iterations}
                                    </span>
                                    <div className="h-px flex-1 bg-border" />
                                  </div>
                                )}
                                <div className="space-y-3">
                                  {visibleGroupQuestions.map((question) => {
                                    questionCounter++;
                                    const qKey = iterations > 1 ? getRepeatKey(question.id, iterIdx) : question.id;
                                    return renderQuestionCard(question, questionCounter, qKey);
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Dynamic repeat controls */}
                          {group.repeat && group.allowDynamicRepeat && (
                            <div className="flex items-center justify-center gap-2 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRepeatCounts(prev => ({
                                  ...prev,
                                  [group.id]: Math.max(1, (prev[group.id] || 1) - 1)
                                }))}
                                disabled={(repeatCounts[group.id] || 1) <= 1}
                              >
                                − Remove
                              </Button>
                              <span className="text-sm text-muted-foreground">
                                {repeatCounts[group.id] || 1} iteration{(repeatCounts[group.id] || 1) !== 1 ? "s" : ""}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRepeatCounts(prev => ({
                                  ...prev,
                                  [group.id]: (prev[group.id] || 1) + 1
                                }))}
                              >
                                + Add More
                              </Button>
                            </div>
                          )}

                          {/* Incomplete iterations reason */}
                          {group.repeat && group.repeatCount && (repeatCounts[group.id] || 1) < group.repeatCount && (
                            <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-4 space-y-2">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                                  Only {repeatCounts[group.id] || 1} of {group.repeatCount} iterations completed
                                </span>
                              </div>
                              <p className="text-xs text-orange-700 dark:text-orange-400">
                                Please provide a reason for not completing all {group.repeatCount} iterations.
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
                  questionCounter++;
                  return renderQuestionCard(question, questionCounter);
                })}

                {/* Submit Button */}
                <div className="pt-4 pb-8">
                  <Button
                    variant="acg"
                    className="w-full"
                    size="lg"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    {isSubmitting ? "Submitting..." : "Submit Form"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

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
    </div>
  );
};

export default FormFiller;
