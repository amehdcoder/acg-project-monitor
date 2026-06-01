import { Question, FormGroup, GeofenceArea } from "./types";
import FormFiller from "@/components/FormFiller/FormFiller";

interface FormPreviewProps {
  formName: string;
  formDescription: string;
  questions: Question[];
  groups?: FormGroup[];
  geofence?: GeofenceArea;
  settings?: any;
  userId?: string;
  projectId?: string;
  onClose: () => void;
}

/**
 * Form Builder preview.
 *
 * Renders the real production FormFiller in `previewMode`, giving the builder a
 * true ODK / Kobo Collect-grade preview: groups, repeat groups, skip logic
 * (relevant), constraints/validation, calculations, cascading selects and every
 * supported question type (GPS, photo, signature, audio, video, barcode, etc.).
 *
 * Preview mode performs NO side effects — no database writes, no location
 * enforcement, no tracking. Submitting only runs validation and shows a toast.
 */
const FormPreview = ({
  formName,
  formDescription,
  questions,
  groups = [],
  geofence,
  settings = {},
  userId = "preview",
  projectId = "preview",
  onClose,
}: FormPreviewProps) => {
  // Strip case-management from preview so the builder always previews the raw
  // form (registration + follow-up groups) without case-selection gating.
  const previewSettings = { ...settings, caseManagement: undefined };

  return (
    <FormFiller
      formId="preview"
      formName={formName || "Untitled Form"}
      formDescription={formDescription}
      questions={questions}
      groups={groups}
      geofence={geofence}
      settings={previewSettings}
      userId={userId}
      projectId={projectId}
      onClose={onClose}
      previewMode
    />
  );
};

export default FormPreview;
