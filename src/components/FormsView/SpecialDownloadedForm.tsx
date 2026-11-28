import { useEffect, useState } from "react";
import { StandardAssessmentView, MentalHealthAssessment } from "@/components/StandardAssessments";
import type { StandardFormCode } from "@/lib/standardAssessments/definitions";
import { STANDARD_ASSESSMENTS } from "@/lib/standardAssessments/definitions";
import { DigitalAttendanceView } from "@/components/DigitalAttendance";
import UPRPForm from "@/components/UPRP/UPRPForm";
import { OfficeFormsView } from "@/components/OfficeForms";
import { ActionTrackerView } from "@/components/ActionTracker";
import { WorkplanView } from "@/components/Workplan";
import BloombergFormFiller from "@/components/Bloomberg/BloombergFormFiller";
import SeeClearFormFiller from "@/components/SeeClear/SeeClearFormFiller";
import BmzFormFiller from "@/components/BMZ/BmzFormFiller";
import ACSMFormFiller from "@/components/ACSM/ACSMFormFiller";
import SBCFormFiller from "@/components/SBC/SBCFormFiller";
import IRFCategoryLauncher from "@/components/IRF/IRFCategoryLauncher";
import EyeDailyReportForm from "@/components/EyeReport/EyeDailyReportForm";
import { MicroplanningView } from "@/components/Microplanning";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CloudOff } from "lucide-react";
import { loadReports } from "@/lib/eyeReport/store";
import type { EyeReportRow } from "@/lib/eyeReport/definition";
import type { FormDownloadForm } from "@/lib/offlineFormDownload";

/** Never send special collectors through generic FormFiller/form_submissions. */
export default function SpecialDownloadedForm({ form, userId, onClose }: { form: FormDownloadForm; userId: string; onClose: () => void }) {
  const code = form.settings.specialCollector as string;
  const projectId = form.project_id;
  const [rows, setRows] = useState<EyeReportRow[]>([]);
  useEffect(() => { if (code === "eye_daily") void loadReports(projectId).then(result => setRows(result.rows)); }, [code, projectId]);
  if (!navigator.onLine && form.settings.onlineRequired) return <div className="space-y-4 p-6"><CloudOff className="h-7 w-7 text-muted-foreground" /><h2 className="text-lg font-semibold">{form.name}</h2><p className="text-sm text-muted-foreground">This form is saved on this device. Its recording service requires an internet connection.</p><Button variant="outline" onClick={onClose}><ArrowLeft className="mr-2 h-4 w-4" />Back to Forms</Button></div>;
  if (code in STANDARD_ASSESSMENTS) return <StandardAssessmentView code={code as StandardFormCode} projectId={projectId} onClose={onClose} />;
  switch (code) {
    case "mental_health": return <MentalHealthAssessment projectId={projectId} onClose={onClose} />;
    case "uprp": return <UPRPForm projectId={projectId} onClose={onClose} />;
    case "attendance": return <DigitalAttendanceView projectId={projectId} onClose={onClose} />;
    case "action_tracker": return <ActionTrackerView projectId={projectId} onClose={onClose} />;
    case "workplan": return <WorkplanView projectId={projectId} onClose={onClose} />;
    case "srf": case "incident": case "leave": case "stationery": return <OfficeFormsView projectId={projectId} filterCodes={[code]} onClose={onClose} />;
    case "bloomberg_form": return <BloombergFormFiller projectId={projectId} onClose={onClose} />;
    case "seeclear_form": return <SeeClearFormFiller onClose={onClose} />;
    case "bmz_form": return <BmzFormFiller onClose={onClose} />;
    case "acsm_form": return <ACSMFormFiller projectId={projectId} onClose={onClose} />;
    case "sbc_form": return <SBCFormFiller projectId={projectId} onClose={onClose} />;
    case "irf_form": return <IRFCategoryLauncher projectId={projectId} onClose={onClose} />;
    case "microplan_entry": return <div><Button variant="outline" onClick={onClose}><ArrowLeft className="mr-2 h-4 w-4" />Back to Forms</Button><MicroplanningView entryOnly /></div>;
    case "eye_daily": case "eye_patient_wg": return <EyeDailyReportForm projectId={projectId} facilities={form.specialContext?.facilities || []} mode={{ kind: "user", userId }} wgOnly={code === "eye_patient_wg"} otherReports={rows} onClose={onClose} />;
    default: return <Button variant="outline" onClick={onClose}>Back to Forms</Button>;
  }
}