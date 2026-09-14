// Documents component — consent forms, beneficiary photos, videos and audio.
//
// Documents are records, not clinical episodes: there is deliberately no
// result/outcome and no next follow-up here. Instead the officer attaches as
// many files as needed and formally attests, with a handwritten signature,
// that the consent obtained was INFORMED consent.

import { useMemo, useState } from "react";
import { FileSignature, ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { enqueue, flushQueue, newUuid } from "@/lib/programmeModule/offlineQueue";
import type { BeneficiaryRow, ProgrammeComponent } from "@/lib/programmeModule/types";
import AttachmentsField, { type Attachment } from "./AttachmentsField";
import SignaturePad from "./SignaturePad";
import { recordAudit } from "./useProgrammeModule";

/** The services the Documents component offers. */
export const DOCUMENT_SERVICES = [
  "Consent form",
  "Beneficiary photos",
  "Beneficiary videos",
  "Beneficiary audio clips",
];

/** Documents is recognised by key or by label, so renamed modules still work. */
export const isDocumentsComponent = (component?: ProgrammeComponent | null) =>
  Boolean(component) &&
  (component!.key === "documents" || /document/i.test(component!.label || ""));

const ACCEPT: Record<string, string> = {
  "Beneficiary photos": "image/*",
  "Beneficiary videos": "video/*",
  "Beneficiary audio clips": "audio/*",
  "Consent form":
    "application/pdf,image/*,.doc,.docx,.odt",
};

/** The attestations a record officer must tick before they can sign. */
const ATTESTATIONS = [
  {
    id: "purpose",
    text: "I explained the purpose of the programme, of this record and of any photograph, video or audio recording, in a language the person understands.",
  },
  {
    id: "voluntary",
    text: "I made clear that participation is entirely voluntary, and that consent may be withdrawn at any time without any loss of care or benefit.",
  },
  {
    id: "risks",
    text: "I explained the foreseeable benefits, risks and how the information and media will be stored, used and shared.",
  },
  {
    id: "questions",
    text: "I gave the person an opportunity to ask questions and answered every question to their satisfaction.",
  },
  {
    id: "capacity",
    text: "I satisfied myself that the person (or their legally authorised representative) has the capacity to consent and did so free of coercion or undue influence.",
  },
  {
    id: "copy",
    text: "A copy of the consent information was offered to the person, and the signed consent has been attached to this record.",
  },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  component: ProgrammeComponent;
  serviceName: string;
  onServiceNameChange: (v: string) => void;
  beneficiary: BeneficiaryRow;
  moduleId: string;
  projectId: string;
  onSaved: () => void;
}

const DocumentsServiceForm = ({
  open, onOpenChange, component, serviceName, onServiceNameChange,
  beneficiary, moduleId, projectId, onSaved,
}: Props) => {
  const { toast } = useToast();
  const services = useMemo(
    () => (component.services?.length ? component.services : DOCUMENT_SERVICES),
    [component.services],
  );

  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [consentBy, setConsentBy] = useState("beneficiary");
  const [consentName, setConsentName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [language, setLanguage] = useState("");
  const [mode, setMode] = useState("signature");
  const [witness, setWitness] = useState("");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [officerName, setOfficerName] = useState("");
  const [officerRole, setOfficerRole] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const allTicked = ATTESTATIONS.every((a) => ticked[a.id]);
  const consentComplete = allTicked && Boolean(signature) && officerName.trim().length > 1;
  const needsWitness = mode !== "signature";

  const canSave =
    Boolean(serviceName) &&
    attachments.length > 0 &&
    consentComplete &&
    (!needsWitness || witness.trim().length > 1);

  const save = async () => {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        beneficiary_id: beneficiary.id,
        module_id: moduleId,
        project_id: projectId,
        component_key: component.key,
        service_name: serviceName,
        service_date: docDate,
        result: null,
        status: "on_track",
        data: {
          attachment_count: attachments.length,
          attachments,
          notes: notes || undefined,
          informed_consent: {
            statement:
              "I attest that the consent recorded here was INFORMED consent, freely given after a full explanation in a language the person understands.",
            given_by: consentBy,
            given_by_name: consentName || null,
            relationship: consentBy === "beneficiary" ? null : relationship || null,
            language_of_explanation: language || null,
            mode,
            witness_name: needsWitness ? witness : null,
            attestations: ATTESTATIONS.map((a) => ({ id: a.id, text: a.text, confirmed: true })),
            officer_name: officerName,
            officer_designation: officerRole || null,
            officer_signature: signature,
            signed_at: new Date().toISOString(),
            signed_by: auth.user?.id || null,
          },
        } as Record<string, unknown>,
        submission_uuid: newUuid(),
        recorded_by: auth.user?.id,
      };

      if (navigator.onLine) {
        const { error } = await supabase.from("beneficiary_services").insert(payload as never);
        if (error) throw error;
        await recordAudit({
          beneficiary_id: beneficiary.id, project_id: projectId,
          action: "document_recorded", field_name: component.key, new_value: serviceName,
        });
        toast({ title: "Document saved", description: "Informed consent acknowledged and signed." });
      } else {
        enqueue("service", payload as unknown as Record<string, unknown>);
        toast({ title: "Saved offline", description: "It will sync when you are back online." });
      }
      void flushQueue();
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not save document", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" /> {component.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={serviceName} onValueChange={onServiceNameChange}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {services.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date obtained</Label>
              <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
            </div>
          </div>

          <AttachmentsField
            label="Attachments"
            hint="Attach as many documents, pictures, videos or audio clips as needed."
            accept={ACCEPT[serviceName]}
            value={attachments}
            projectId={projectId}
            beneficiaryId={beneficiary.id}
            onChange={setAttachments}
          />

          <Card className="space-y-4 border-primary/30 p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold text-foreground">Informed consent acknowledgement</h3>
                <p className="text-xs text-muted-foreground">
                  Completed by the record officer. All statements must be confirmed and signed before
                  this document can be saved.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Consent given by</Label>
                <Select value={consentBy} onValueChange={setConsentBy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1200] bg-popover">
                    <SelectItem value="beneficiary">The beneficiary</SelectItem>
                    <SelectItem value="parent_guardian">Parent or guardian</SelectItem>
                    <SelectItem value="representative">Legally authorised representative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Full name of the person consenting</Label>
                <Input value={consentName} onChange={(e) => setConsentName(e.target.value)} />
              </div>
              {consentBy !== "beneficiary" && (
                <div className="space-y-1.5">
                  <Label>Relationship to the beneficiary</Label>
                  <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Language used for the explanation</Label>
                <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="e.g. Hausa" />
              </div>
              <div className="space-y-1.5">
                <Label>How consent was given</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1200] bg-popover">
                    <SelectItem value="signature">Written signature</SelectItem>
                    <SelectItem value="thumbprint">Thumbprint (witnessed)</SelectItem>
                    <SelectItem value="verbal">Verbal, with an impartial witness</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {needsWitness && (
                <div className="space-y-1.5">
                  <Label>Impartial witness name</Label>
                  <Input value={witness} onChange={(e) => setWitness(e.target.value)} />
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg bg-muted/50 p-3">
              {ATTESTATIONS.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-2">
                  <Checkbox
                    checked={Boolean(ticked[a.id])}
                    onCheckedChange={(v) => setTicked((p) => ({ ...p, [a.id]: Boolean(v) }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-snug text-foreground">{a.text}</span>
                </label>
              ))}
            </div>

            <p className="rounded-lg border border-border bg-background p-3 text-sm font-medium text-foreground">
              I attest that the consent recorded here was <span className="uppercase">informed consent</span>,
              freely given after a full explanation, and that I have recorded it truthfully.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Record officer — full name</Label>
                <Input value={officerName} onChange={(e) => setOfficerName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Designation</Label>
                <Input value={officerRole} onChange={(e) => setOfficerRole(e.target.value)} placeholder="e.g. Records Officer" />
              </div>
            </div>

            <SignaturePad
              label="Record officer signature"
              hint={`Signed on ${new Date().toLocaleString()} · your account is recorded with the signature.`}
              value={signature}
              onChange={setSignature}
            />
          </Card>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !canSave}>
            {saving ? "Saving…" : "Save document"}
          </Button>
        </DialogFooter>
        {!canSave && (
          <p className="text-xs text-muted-foreground">
            Choose a document type, attach at least one file, confirm every consent statement and sign.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DocumentsServiceForm;
