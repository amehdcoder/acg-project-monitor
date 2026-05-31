import { useEffect, useState } from "react";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StandardAssessmentFiller from "./StandardAssessmentFiller";
import FacilityAssessmentFiller from "./FacilityAssessmentFiller";
import StandardAssessmentAnalytics from "./StandardAssessmentAnalytics";
import { STANDARD_ASSESSMENTS, StandardFormCode } from "@/lib/standardAssessments/definitions";

interface Props {
  code: StandardFormCode;
  projectId?: string | null;
  onClose: () => void;
}

/** Forms that can be administered to multiple respondents in one session */
const ITERABLE: StandardFormCode[] = ["wg_ss", "gad_7", "phq_9"];

const StandardAssessmentView = ({ code, projectId, onClose }: Props) => {
  const def = STANDARD_ASSESSMENTS[code];
  const isIterable = ITERABLE.includes(code);
  const isFacility = code === "hfat" || code === "lfat";

  const [tab, setTab] = useState<"fill" | "analytics">("fill");
  const [reloadKey, setReloadKey] = useState(0);

  // Facility assessments (HFAT / LFAT) use a dedicated rich multi-step wizard
  if (isFacility) {
    return (
      <div className="p-2 sm:p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="max-w-lg mx-auto">
          <TabsList className="mb-2">
            <TabsTrigger value="fill">Fill assessment</TabsTrigger>
            <TabsTrigger value="analytics">Analysis</TabsTrigger>
          </TabsList>
          <TabsContent value="fill">
            <FacilityAssessmentFiller
              key={reloadKey}
              code={code as "hfat" | "lfat"}
              projectId={projectId}
              onClose={onClose}
              onSubmitted={() => setReloadKey((k) => k + 1)}
            />
          </TabsContent>
          <TabsContent value="analytics">
            <StandardAssessmentAnalytics key={reloadKey} code={code} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Session state (only used for iterable forms)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activityDescription, setActivityDescription] = useState("");
  const [showActivityDialog, setShowActivityDialog] = useState(isIterable);
  const [respondentCount, setRespondentCount] = useState(0);
  const [fillerKey, setFillerKey] = useState(0);

  useEffect(() => {
    if (isIterable && !sessionId) {
      setSessionId(crypto.randomUUID());
    }
  }, [isIterable, sessionId]);

  const startSession = () => {
    if (!activityDescription.trim()) return;
    setShowActivityDialog(false);
  };

  const handleSubmitted = () => {
    setReloadKey((k) => k + 1);
    if (isIterable) {
      setRespondentCount((c) => c + 1);
    }
  };

  return (
    <div className="p-3 sm:p-4 max-w-6xl mx-auto space-y-3">
      <Button variant="ghost" onClick={onClose} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to forms
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold">{def.name}</h1>
          <p className="text-sm text-muted-foreground">{def.description}</p>
        </div>
        {isIterable && activityDescription && (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 max-w-md">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              Activity • {respondentCount} respondent{respondentCount === 1 ? "" : "s"}
            </div>
            <p className="text-sm mt-0.5 line-clamp-2">{activityDescription}</p>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 mt-1 text-xs"
              onClick={() => setShowActivityDialog(true)}
            >
              Edit description
            </Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="fill">Fill assessment</TabsTrigger>
          <TabsTrigger value="analytics">Analysis</TabsTrigger>
        </TabsList>
        <TabsContent value="fill" className="mt-3">
          {(!isIterable || !showActivityDialog) && (
            <StandardAssessmentFiller
              key={fillerKey}
              code={code}
              projectId={projectId}
              sessionId={isIterable ? sessionId : null}
              activityDescription={isIterable ? activityDescription : null}
              showSessionControls={isIterable}
              respondentCount={respondentCount}
              onAddAnother={() => setFillerKey((k) => k + 1)}
              onClose={onClose}
              onSubmitted={handleSubmitted}
            />
          )}
        </TabsContent>
        <TabsContent value="analytics" className="mt-3">
          <StandardAssessmentAnalytics key={reloadKey} code={code} />
        </TabsContent>
      </Tabs>

      {/* Activity description dialog — required before iteration starts */}
      <Dialog open={showActivityDialog} onOpenChange={(o) => {
        // Only allow closing if description already supplied
        if (!o && activityDescription.trim()) setShowActivityDialog(false);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Describe this activity</DialogTitle>
            <DialogDescription>
              All respondents you assess in this session will be tagged with this description.
              You can administer the {def.shortName} to as many individuals as needed before finishing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="activity-desc">Activity description *</Label>
            <Textarea
              id="activity-desc"
              placeholder="e.g. Disability screening at Karu PHC outreach — 25 May 2026"
              value={activityDescription}
              onChange={(e) => setActivityDescription(e.target.value)}
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={startSession} disabled={!activityDescription.trim()}>
              Start session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StandardAssessmentView;
