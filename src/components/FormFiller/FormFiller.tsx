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
  Repeat,
  Folder,
  Plus,
  Ban,
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
import VideoCapture from "./VideoCapture";
import BatteryOptimizationIndicator from "./BatteryOptimizationIndicator";
import { useStationaryGeofence } from "@/hooks/useStationaryGeofence";
import { useContinuousAuth } from "@/hooks/useContinuousAuth";
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
  // Confirm dialog for submitting with incomplete iterations
  const [showIncompleteConfirm, setShowIncompleteConfirm] = useState(false);

  const { isOnline, pendingCount, saveSubmission } = useOfflineStorage();

  // Stationary geofence for battery optimization
  const stationaryState = useStationaryGeofence({
    enabled: effectiveRequireLocation || isGeofenceEnabled,
  });

  // Continuous authentication
  const { posture: authPosture } = useContinuousAuth(true);
  
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

  const effectiveGeofence = userGeofenceLoaded ? userGeofence : undefined;
  const { validatePosition, isGeofenceEnabled, normalizedGeofence } = useGeofenceValidation(effectiveGeofence);
  const { getCurrentPosition, isLoading: isGpsLoading } = useGeolocation();
  
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

  useEffect(() => {
    if (!effectiveAutoSave || Object.keys(responses).length === 0) return;
    const interval = setInterval(() => {
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

  const geofenceValidation = useMemo(() => {
    if (!gpsPosition || !isGeofenceEnabled) return null;
    return validatePosition(gpsPosition.lat, gpsPosition.lng);
  }, [gpsPosition, isGeofenceEnabled, validatePosition]);

  const updateResponse = (questionId: string, value: any) => {
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

  // Filter options for cascading selects based on choice_filter expression
  const getFilteredOptions = useCallback((question: Question) => {
    if (!question.options || !question.choiceFilter) return question.options;
    
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
  }, [resolveExpression]);

  const shouldShowQuestion = (question: Question): boolean => {
    // Calculate questions are always "shown" (their value is computed silently)
    // but we handle visibility separately
    if (!question.relevant) return true;

    const relevantExpr = question.relevant;

    // selected(${name}, 'value')
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

    // ${name} = 'value' or ${name} != 'value'
    const eqMatch = relevantExpr.match(/\$\{(.+?)\}\s*(=|!=)\s*['"](.+?)['"]/);
    if (eqMatch) {
      const [, refName, operator, expectedValue] = eqMatch;
      const qId = nameToIdMap[refName];
      if (qId) {
        const val = String(responses[qId] || "");
        if (operator === "=") return val === expectedValue;
        if (operator === "!=") return val !== expectedValue;
      }
      return operator === "!=";
    }

    // ${name} > value, etc.
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

    // ${name} (truthy check)
    const truthyMatch = relevantExpr.match(/^\$\{(.+?)\}$/);
    if (truthyMatch) {
      const qId = nameToIdMap[truthyMatch[1]];
      if (qId) {
        const val = responses[qId];
        return val !== undefined && val !== null && val !== "" && val !== false;
      }
      return false;
    }

    return true;
  };

  // Check if any repeat groups are incomplete
  const getIncompleteRepeatGroups = useCallback(() => {
    return groups.filter(g => g.repeat && g.repeatCount && (repeatCounts[g.id] || 1) < g.repeatCount);
  }, [groups, repeatCounts]);

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    const visibleQuestions = questions.filter(shouldShowQuestion);

    for (const question of visibleQuestions) {
      // Skip validation for calculate questions — they're auto-computed
      if (question.type === "calculate") continue;

      const value = responses[question.id];

      if (question.required) {
        if (value === undefined || value === null || value === "") {
          errors[question.id] = question.constraintMessage || "This field is required";
          continue;
        }
        if (Array.isArray(value) && value.length === 0) {
          errors[question.id] = question.constraintMessage || "Please select at least one option";
          continue;
        }
      }

      if (value === undefined || value === null || value === "") continue;

      if (question.type === "number" && question.validation) {
        const numValue = parseFloat(value);
        if (question.validation.min !== undefined && numValue < question.validation.min) {
          errors[question.id] = `Value must be at least ${question.validation.min}`;
        }
        if (question.validation.max !== undefined && numValue > question.validation.max) {
          errors[question.id] = `Value must be at most ${question.validation.max}`;
        }
      }

      if (question.validation?.regex) {
        const regex = new RegExp(question.validation.regex);
        if (!regex.test(String(value))) {
          errors[question.id] = question.constraintMessage || "Invalid format";
        }
      }
    }

    // Validate repeat group iterations — require reason if incomplete
    for (const group of groups) {
      if (group.repeat && group.repeatCount) {
        const currentCount = repeatCounts[group.id] || 1;
        if (currentCount < group.repeatCount) {
          if (!incompleteRepeatReasons[group.id]?.trim()) {
            errors[`_repeat_reason_${group.id}`] = `Please provide a reason for completing only ${currentCount} of ${group.repeatCount} iterations for "${group.label}"`;
          }
        }
      }
    }

    // Validate repeated question fields
    for (const group of groups) {
      if (!group.repeat) continue;
      const iterations = repeatCounts[group.id] || 1;
      const visibleGroupQuestions = group.questions.filter(shouldShowQuestion);
      for (let iterIdx = 0; iterIdx < iterations; iterIdx++) {
        for (const question of visibleGroupQuestions) {
          // Skip calculate questions in groups too
          if (question.type === "calculate") continue;
          
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

    // Geofence validation
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
    toast({ title: "Draft Saved", description: "Your form has been saved locally." });
  };

  const clearDraft = () => {
    localStorage.removeItem(`form_draft_${formId}`);
  };

  const handleSubmit = async () => {
    if (requiresCaseSelection && !selectedCase) {
      console.log("No case selected — will auto-register if needed");
    }

    if (!validateForm()) {
      toast({ title: "Validation Failed", description: "Please fix the errors before submitting.", variant: "destructive" });
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

      const result = await saveSubmission(
        formId,
        userId,
        submissionData,
        gpsPosition ? { lat: gpsPosition.lat, lng: gpsPosition.lng } : null,
        geofenceValidation?.isWithinGeofence ?? null,
        submissionType
      );

      if (result.success) {
        if (settings.caseManagement?.enabled) {
          await processCaseAction(formId, responses, result.id);
        }
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
      toast({ title: "Submission Failed", description: "An error occurred. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

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
        if (/^[\d\s+\-*/().]+$/.test(resolved.trim())) {
          return String(Function('"use strict"; return (' + resolved + ')')());
        }
        return resolved;
      } catch {
        return resolved;
      }
    } catch {
      return "";
    }
  }, [nameToIdMap, responses]);

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
    const value = responses[qKey];
    const error = validationErrors[qKey];
    const update = (val: any) => {
      setResponses(prev => ({ ...prev, [qKey]: val }));
      if (validationErrors[qKey]) {
        setValidationErrors(prev => { const u = { ...prev }; delete u[qKey]; return u; });
      }
    };

    switch (question.type) {
      case "text":
        return (
          <Input
            value={value || ""}
            onChange={(e) => update(e.target.value)}
            placeholder="Enter your answer"
            className={error ? "border-destructive" : ""}
          />
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
        return <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">{question.hint || "This is an informational note."}</div>;
      case "select_one": {
        // Apply cascading choice_filter
        const filteredOptions = getFilteredOptions(question);
        return (
          <RadioGroup value={value || ""} onValueChange={(val) => update(val)}>
            {filteredOptions?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={`${qKey}-${option.id}`} />
                <Label htmlFor={`${qKey}-${option.id}`}>{option.label}</Label>
              </div>
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
          <div className="space-y-2">
            {filteredOptions?.map((option) => (
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
            {filteredOptions?.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No options available based on your previous selections.</p>
            )}
          </div>
        );
      }
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
        return <GPSCapture value={value} onChange={(pos) => { update(pos); if (!gpsPosition && pos) setGpsPosition(pos); }} geofenceValidation={geofenceValidation} />;
      case "image":
        return <PhotoCapture value={value} onChange={(photo) => update(photo)} />;
      case "audio":
        return <AudioCapture value={value} onChange={(audio) => update(audio)} />;
      case "signature":
        return <SignatureCapture value={value} onChange={(sig) => update(sig)} />;
      case "barcode":
        return <BarcodeScanner value={value} onChange={(code) => update(code)} />;
      case "video":
        return <VideoCapture value={value} onChange={(video) => update(video)} />;
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
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            {question.hint || "This is an informational note."}
          </div>
        );

      case "select_one": {
        const filteredOptions = getFilteredOptions(question);
        return (
          <RadioGroup value={value || ""} onValueChange={(val) => updateResponse(question.id, val)}>
            {filteredOptions?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={`${question.id}-${option.id}`} />
                <Label htmlFor={`${question.id}-${option.id}`}>{option.label}</Label>
              </div>
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
          <div className="space-y-2">
            {filteredOptions?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`${question.id}-${option.id}`}
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
                <Label htmlFor={`${question.id}-${option.id}`}>{option.label}</Label>
              </div>
            ))}
            {filteredOptions?.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No options available based on your previous selections.</p>
            )}
          </div>
        );
      }

      case "date":
        return <Input type="date" value={value || ""} onChange={(e) => updateResponse(question.id, e.target.value)} className={error ? "border-destructive" : ""} />;

      case "time":
        return <Input type="time" value={value || ""} onChange={(e) => updateResponse(question.id, e.target.value)} className={error ? "border-destructive" : ""} />;

      case "datetime":
        return <Input type="datetime-local" value={value || ""} onChange={(e) => updateResponse(question.id, e.target.value)} className={error ? "border-destructive" : ""} />;

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
        return <PhotoCapture value={value} onChange={(photo) => updateResponse(question.id, photo)} />;

      case "audio":
        return <AudioCapture value={value} onChange={(audio) => updateResponse(question.id, audio)} />;

      case "signature":
        return <SignatureCapture value={value} onChange={(sig) => updateResponse(question.id, sig)} />;

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
              <div className="flex items-center gap-2">
                {isGpsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : gpsPosition ? (
                  <MapPin className="h-4 w-4 text-green-500" />
                ) : (
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-xs text-muted-foreground">
                  {isGpsLoading ? "Getting location..." : gpsPosition ? `±${Math.round(gpsPosition.accuracy)}m accuracy` : "No GPS"}
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
      <div className="flex-1 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch">
        <div className="mx-auto max-w-2xl p-4 pb-24">
          {/* Form Header */}
          <Card className="border-0 shadow-card mb-4">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
              <CardTitle className="font-display text-xl">{formName || "Untitled Form"}</CardTitle>
              {formDescription && <CardDescription className="text-sm">{formDescription}</CardDescription>}
            </CardHeader>
          </Card>

          {/* Validation Errors Summary */}
          {Object.keys(validationErrors).length > 0 && (
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

            let questionCounter = 0;
            return (
              <div className="space-y-4">
                {/* Groups */}
                {groups.map((group) => {
                  const isCollapsed = collapsedGroups[group.id];
                  const iterations = group.repeat ? (repeatCounts[group.id] || 1) : 1;
                  const visibleGroupQuestions = group.questions.filter(shouldShowQuestion);
                  const visibleNonCalcQuestions = visibleGroupQuestions.filter(q => q.type !== "calculate");

                  // Auto-compute calculate questions in group
                  visibleGroupQuestions.filter(q => q.type === "calculate").forEach(q => {
                    for (let iterIdx = 0; iterIdx < iterations; iterIdx++) {
                      const qKey = iterations > 1 ? getRepeatKey(q.id, iterIdx) : q.id;
                      const val = computeCalcValue(q, qKey);
                      if (val !== responses[qKey]) {
                        setTimeout(() => setResponses(prev => ({ ...prev, [qKey]: val })), 0);
                      }
                    }
                  });

                  return (
                    <Card key={group.id} className="border border-primary/30 overflow-hidden">
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
                            <h3 className="font-semibold text-foreground">{group.label}</h3>
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
                                    questionCounter++;
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
    </div>
  );
};

export default FormFiller;
