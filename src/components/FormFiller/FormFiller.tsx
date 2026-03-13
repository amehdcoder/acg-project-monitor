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

  const shouldShowQuestion = (question: Question): boolean => {
    if (!question.relevant) return true;

    // Parse simple skip logic like "${q1} = 'yes'"
    const match = question.relevant.match(/\$\{(.+?)\}\s*=\s*['"](.+?)['"]/);
    if (match) {
      const [, refQuestionId, expectedValue] = match;
      const refQuestion = questions.find(
        (q) => q.id === refQuestionId || q.label === refQuestionId
      );
      if (refQuestion) {
        return responses[refQuestion.id] === expectedValue;
      }
    }
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
  }, [questions, responses, gpsPosition, effectiveRequireLocation, effectiveEnforceGeofence, geofenceValidation]);

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

          {/* Questions */}
          {visibleQuestions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No questions in this form.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {visibleQuestions.map((question, index) => {
                const error = validationErrors[question.id];
                return (
                  <Card
                    key={question.id}
                    className={`border-0 shadow-soft ${
                      error ? "ring-1 ring-destructive" : ""
                    }`}
                  >
                    <CardContent className="pt-5">
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {index + 1}
                          </span>
                          <div className="flex-1">
                            <Label className="text-base font-medium">
                              {question.label}
                              {question.required && (
                                <span className="ml-1 text-destructive">*</span>
                              )}
                            </Label>
                            {question.hint && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {question.hint}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="ml-8">
                          {renderQuestionInput(question)}
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
          )}
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
