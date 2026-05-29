import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Briefcase,
  Plus,
  Trash2,
  Save,
  Info,
  UserPlus,
  RefreshCw,
  XCircle,
  ArrowRight,
  Database,
  Tag,
} from "lucide-react";
import { Question } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type CaseManagementAction = "none" | "register" | "update" | "close";

export interface CaseProperty {
  id: string;
  name: string;
  label: string;
  questionId?: string;
  defaultValue?: string;
  description?: string;
}

export interface CaseType {
  id: string;
  name: string;
  label: string;
  description?: string;
  properties: CaseProperty[];
  projectId: string;
}

export interface CaseManagementSettings {
  enabled: boolean;
  action: CaseManagementAction;
  caseType?: string;
  caseTypeId?: string;
  caseNameQuestion?: string;
  saveToProperties: { questionId: string; propertyName: string }[];
  closeCondition?: string;
  loadFromProperties: { propertyName: string; questionId: string }[];
}

interface CaseManagementEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: Question[];
  groups?: { id: string; label?: string; name?: string; repeat?: boolean; questions: Question[] }[];
  settings: CaseManagementSettings;
  onSave: (settings: CaseManagementSettings) => void;
  projectId?: string;
}

const CaseManagementEditor = ({
  open,
  onOpenChange,
  questions,
  groups = [],
  settings,
  onSave,
  projectId,
}: CaseManagementEditorProps) => {
  // Flatten top-level questions AND questions nested inside normal/repeat
  // groups so case name & property mapping can reference any field (CommCare-style).
  const allQuestions: { id: string; label: string; type: string }[] = [
    ...questions.map((q) => ({ id: q.id, label: q.label, type: q.type as string })),
    ...groups.flatMap((g) =>
      (g.questions || []).map((q) => ({
        id: q.id,
        label: `${g.label || g.name || "Group"}${g.repeat ? " (repeat)" : ""} › ${q.label}`,
        type: q.type as string,
      })),
    ),
  ];
  // Helper function to safely parse case properties from JSON
  const parseCaseProperties = (properties: unknown): CaseProperty[] => {
    if (!Array.isArray(properties)) return [];
    return properties.filter((prop): prop is CaseProperty => {
      return (
        typeof prop === "object" &&
        prop !== null &&
        "id" in prop &&
        "name" in prop &&
        "label" in prop &&
        typeof (prop as Record<string, unknown>).id === "string" &&
        typeof (prop as Record<string, unknown>).name === "string" &&
        typeof (prop as Record<string, unknown>).label === "string"
      );
    });
  };

  const [localSettings, setLocalSettings] = useState<CaseManagementSettings>(settings);
  const [caseTypes, setCaseTypes] = useState<CaseType[]>([]);
  const [showNewCaseType, setShowNewCaseType] = useState(false);
  const [newCaseType, setNewCaseType] = useState({
    name: "",
    label: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && projectId) {
      fetchCaseTypes();
    }
  }, [open, projectId]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const fetchCaseTypes = async () => {
    if (!projectId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("case_types")
        .select("*")
        .eq("project_id", projectId);

      if (error) throw error;

      setCaseTypes(
        (data || []).map((ct) => ({
          id: ct.id,
          name: ct.name,
          label: ct.label,
          description: ct.description || "",
          properties: parseCaseProperties(ct.properties),
          projectId: ct.project_id,
        }))
      );
    } catch (error) {
      console.error("Error fetching case types:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCaseType = async () => {
    if (!projectId || !newCaseType.name.trim() || !newCaseType.label.trim()) {
      toast({
        title: "Validation Error",
        description: "Case type name and label are required.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("case_types")
        .insert({
          project_id: projectId,
          name: newCaseType.name.toLowerCase().replace(/\s+/g, "_"),
          label: newCaseType.label,
          description: newCaseType.description,
          properties: [],
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setCaseTypes((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          label: data.label,
          description: data.description || "",
          properties: [],
          projectId: data.project_id,
        },
      ]);

      setLocalSettings((prev) => ({
        ...prev,
        caseType: data.name,
        caseTypeId: data.id,
      }));

      setNewCaseType({ name: "", label: "", description: "" });
      setShowNewCaseType(false);

      toast({
        title: "Case Type Created",
        description: `"${data.label}" case type has been created.`,
      });
    } catch (error) {
      console.error("Error creating case type:", error);
      toast({
        title: "Error",
        description: "Failed to create case type.",
        variant: "destructive",
      });
    }
  };

  const handleAddSaveProperty = () => {
    setLocalSettings((prev) => ({
      ...prev,
      saveToProperties: [
        ...prev.saveToProperties,
        { questionId: "", propertyName: "" },
      ],
    }));
  };

  const handleRemoveSaveProperty = (index: number) => {
    setLocalSettings((prev) => ({
      ...prev,
      saveToProperties: prev.saveToProperties.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateSaveProperty = (
    index: number,
    field: "questionId" | "propertyName",
    value: string
  ) => {
    setLocalSettings((prev) => ({
      ...prev,
      saveToProperties: prev.saveToProperties.map((prop, i) =>
        i === index ? { ...prop, [field]: value } : prop
      ),
    }));
  };

  const handleAddLoadProperty = () => {
    setLocalSettings((prev) => ({
      ...prev,
      loadFromProperties: [
        ...prev.loadFromProperties,
        { propertyName: "", questionId: "" },
      ],
    }));
  };

  const handleRemoveLoadProperty = (index: number) => {
    setLocalSettings((prev) => ({
      ...prev,
      loadFromProperties: prev.loadFromProperties.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateLoadProperty = (
    index: number,
    field: "propertyName" | "questionId",
    value: string
  ) => {
    setLocalSettings((prev) => ({
      ...prev,
      loadFromProperties: prev.loadFromProperties.map((prop, i) =>
        i === index ? { ...prop, [field]: value } : prop
      ),
    }));
  };

  const handleSave = () => {
    onSave(localSettings);
    onOpenChange(false);
  };

  const selectedCaseType = caseTypes.find(
    (ct) => ct.name === localSettings.caseType
  );

  const getActionIcon = (action: CaseManagementAction) => {
    switch (action) {
      case "register":
        return <UserPlus className="h-4 w-4" />;
      case "update":
        return <RefreshCw className="h-4 w-4" />;
      case "close":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Briefcase className="h-4 w-4" />;
    }
  };

  const getActionLabel = (action: CaseManagementAction) => {
    switch (action) {
      case "register":
        return "Registration Form";
      case "update":
        return "Follow-up Form";
      case "close":
        return "Close Case Form";
      default:
        return "No Case Management";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Case Management Settings
          </DialogTitle>
          <DialogDescription>
            Configure how this form interacts with cases for follow-up visits
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Enable Case Management */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <Database className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    <div>
                      <Label className="text-base font-medium">
                        Enable Case Management
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Link form submissions to cases for longitudinal tracking
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={localSettings.enabled}
                    onCheckedChange={(enabled) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        enabled,
                        action: enabled ? "register" : "none",
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {localSettings.enabled && (
              <>
                {/* Case Type Selection */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      Case Type
                    </CardTitle>
                    <CardDescription>
                      Select or create a case type for this form
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {caseTypes.length > 0 ? (
                      <div className="space-y-2">
                        <Label>Select Case Type</Label>
                        <Select
                          value={localSettings.caseType || ""}
                          onValueChange={(value) =>
                            setLocalSettings((prev) => ({
                              ...prev,
                              caseType: value,
                              caseTypeId: caseTypes.find((ct) => ct.name === value)?.id,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a case type" />
                          </SelectTrigger>
                          <SelectContent>
                            {caseTypes.map((ct) => (
                              <SelectItem key={ct.id} value={ct.name}>
                                {ct.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          No case types found. Create one to enable case management.
                        </AlertDescription>
                      </Alert>
                    )}

                    {!showNewCaseType ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowNewCaseType(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create New Case Type
                      </Button>
                    ) : (
                      <Card className="border-primary/50">
                        <CardContent className="pt-4 space-y-3">
                          <div className="space-y-2">
                            <Label>Case Type Name</Label>
                            <Input
                              placeholder="e.g., patient, household, beneficiary"
                              value={newCaseType.name}
                              onChange={(e) =>
                                setNewCaseType((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }))
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Used internally (lowercase, no spaces)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label>Display Label</Label>
                            <Input
                              placeholder="e.g., Patient, Household, Beneficiary"
                              value={newCaseType.label}
                              onChange={(e) =>
                                setNewCaseType((prev) => ({
                                  ...prev,
                                  label: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Description (optional)</Label>
                            <Textarea
                              placeholder="Brief description of this case type"
                              value={newCaseType.description}
                              onChange={(e) =>
                                setNewCaseType((prev) => ({
                                  ...prev,
                                  description: e.target.value,
                                }))
                              }
                              rows={2}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleCreateCaseType}>
                              <Save className="h-4 w-4 mr-2" />
                              Create
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setShowNewCaseType(false);
                                setNewCaseType({ name: "", label: "", description: "" });
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>

                {/* Form Action */}
                {localSettings.caseType && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Form Action</CardTitle>
                      <CardDescription>
                        Define how this form interacts with cases
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Tabs
                        value={localSettings.action}
                        onValueChange={(value) =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            action: value as CaseManagementAction,
                          }))
                        }
                        className="w-full"
                      >
                        <TabsList className="grid grid-cols-3 w-full">
                          <TabsTrigger value="register" className="gap-2">
                            <UserPlus className="h-4 w-4" />
                            Register
                          </TabsTrigger>
                          <TabsTrigger value="update" className="gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Follow-up
                          </TabsTrigger>
                          <TabsTrigger value="close" className="gap-2">
                            <XCircle className="h-4 w-4" />
                            Close
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="register" className="mt-4 space-y-4">
                          <Alert>
                            <UserPlus className="h-4 w-4" />
                            <AlertDescription>
                              This form will create a new case when submitted.
                              The case will appear in the case list for follow-up.
                            </AlertDescription>
                          </Alert>

                          <div className="space-y-2">
                            <Label>Case Name Question</Label>
                            <Select
                              value={localSettings.caseNameQuestion || ""}
                              onValueChange={(value) =>
                                setLocalSettings((prev) => ({
                                  ...prev,
                                  caseNameQuestion: value,
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select question for case name" />
                              </SelectTrigger>
                              <SelectContent>
                                {allQuestions
                                  .filter((q) => q.type === "text" || q.type === "number")
                                  .map((q) => (
                                    <SelectItem key={q.id} value={q.id}>
                                      {q.label}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              This question's answer will be used as the case identifier
                            </p>
                          </div>
                        </TabsContent>

                        <TabsContent value="update" className="mt-4 space-y-4">
                          <Alert>
                            <RefreshCw className="h-4 w-4" />
                            <AlertDescription>
                              This form will update an existing case. Users will
                              select a case from the case list before filling the form.
                            </AlertDescription>
                          </Alert>
                        </TabsContent>

                        <TabsContent value="close" className="mt-4 space-y-4">
                          <Alert>
                            <XCircle className="h-4 w-4" />
                            <AlertDescription>
                              This form will close the case when submitted.
                              Closed cases will be removed from the active case list.
                            </AlertDescription>
                          </Alert>

                          <div className="space-y-2">
                            <Label>Close Condition (optional)</Label>
                            <Input
                              placeholder="e.g., #form/outcome = 'completed'"
                              value={localSettings.closeCondition || ""}
                              onChange={(e) =>
                                setLocalSettings((prev) => ({
                                  ...prev,
                                  closeCondition: e.target.value,
                                }))
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Leave empty to always close, or specify a condition
                            </p>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                )}

                {/* Save to Case Properties */}
                {localSettings.caseType && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-primary" />
                        Save to Case Properties
                      </CardTitle>
                      <CardDescription>
                        Map form questions to case properties for later reference
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {localSettings.saveToProperties.map((prop, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Select
                            value={prop.questionId}
                            onValueChange={(value) =>
                              handleUpdateSaveProperty(index, "questionId", value)
                            }
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select question" />
                            </SelectTrigger>
                            <SelectContent>
                              {allQuestions.map((q) => (
                                <SelectItem key={q.id} value={q.id}>
                                  {q.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Input
                            className="flex-1"
                            placeholder="Property name"
                            value={prop.propertyName}
                            onChange={(e) =>
                              handleUpdateSaveProperty(index, "propertyName", e.target.value)
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveSaveProperty(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddSaveProperty}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Property Mapping
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Load from Case Properties (for update/close forms) */}
                {localSettings.caseType &&
                  (localSettings.action === "update" ||
                    localSettings.action === "close") && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Database className="h-4 w-4 text-primary" />
                          Load from Case Properties
                        </CardTitle>
                        <CardDescription>
                          Pre-populate form questions with saved case data
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {localSettings.loadFromProperties.map((prop, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              className="flex-1"
                              placeholder="Case property name"
                              value={prop.propertyName}
                              onChange={(e) =>
                                handleUpdateLoadProperty(
                                  index,
                                  "propertyName",
                                  e.target.value
                                )
                              }
                            />
                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Select
                              value={prop.questionId}
                              onValueChange={(value) =>
                                handleUpdateLoadProperty(index, "questionId", value)
                              }
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select question" />
                              </SelectTrigger>
                              <SelectContent>
                                {questions.map((q) => (
                                  <SelectItem key={q.id} value={q.id}>
                                    {q.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLoadProperty(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddLoadProperty}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Property Mapping
                        </Button>
                      </CardContent>
                    </Card>
                  )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CaseManagementEditor;
