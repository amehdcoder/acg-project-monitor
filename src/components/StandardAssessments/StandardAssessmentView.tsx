import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StandardAssessmentFiller from "./StandardAssessmentFiller";
import StandardAssessmentAnalytics from "./StandardAssessmentAnalytics";
import { STANDARD_ASSESSMENTS, StandardFormCode } from "@/lib/standardAssessments/definitions";

interface Props {
  code: StandardFormCode;
  projectId?: string | null;
  onClose: () => void;
}

const StandardAssessmentView = ({ code, projectId, onClose }: Props) => {
  const def = STANDARD_ASSESSMENTS[code];
  const [tab, setTab] = useState<"fill" | "analytics">("fill");
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="p-3 sm:p-4 max-w-6xl mx-auto space-y-3">
      <Button variant="ghost" onClick={onClose} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to forms
      </Button>
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold">{def.name}</h1>
        <p className="text-sm text-muted-foreground">{def.description}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="fill">Fill assessment</TabsTrigger>
          <TabsTrigger value="analytics">Analysis</TabsTrigger>
        </TabsList>
        <TabsContent value="fill" className="mt-3">
          <StandardAssessmentFiller
            code={code}
            projectId={projectId}
            onClose={onClose}
            onSubmitted={() => setReloadKey((k) => k + 1)}
          />
        </TabsContent>
        <TabsContent value="analytics" className="mt-3">
          <StandardAssessmentAnalytics key={reloadKey} code={code} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StandardAssessmentView;
