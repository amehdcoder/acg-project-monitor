import { useState } from "react";
import { scrollToAppTop } from "@/lib/scrollToAppTop";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Plus, Trash2,
  Loader2, ShieldCheck, Upload, User as UserIcon, ClipboardList, Wallet, ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  TRAINING_TYPES, DESIGNATIONS, SEXES,
  DISABILITY_TYPES, PHONE_REGEX, ACCOUNT_NUMBER_REGEX, labelOf,
  emptyParticipant, validateParticipant, UProParticipant,
} from "@/lib/uprp/definitions";
import { suggestBanksFromAccount } from "@/lib/uprp/nubanBanks";
import { useCustomBanks } from "@/hooks/useCustomBanks";
import ParticipantGeoCascade from "./ParticipantGeoCascade";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

const STEPS = ["Identification", "Participants", "Uploads", "Review"];

const Field = ({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium text-emerald-900/80">
      {label}{required && <span className="text-red-500"> *</span>}
    </Label>
    {children}
    {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
  </div>
);

const UPRPForm = ({ projectId, onClose }: Props) => {
  const { user } = useAuth();
  const { banks, addBank, valueForName } = useCustomBanks();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Step 1
  const [collector, setCollector] = useState("");
  const [trainingType, setTrainingType] = useState("");
  const [center, setCenter] = useState("");

  // Step 2 (repeat)
  const [participants, setParticipants] = useState<UProParticipant[]>([emptyParticipant()]);
  const [expanded, setExpanded] = useState<string>(participants[0].id);

  // Step 3 (image repeat)
  const [files, setFiles] = useState<File[]>([]);

  const updateP = (id: string, patch: Partial<UProParticipant>) =>
    setParticipants((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Normalises a name for tolerant comparison (order-independent, punctuation-free).
  const normName = (s: string) =>
    (s || "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");

  // Verifies the account against Paystack's Resolve Account API and stores the
  // returned official account name on the participant.
  const resolveAccount = async (p: UProParticipant) => {
    if (!ACCOUNT_NUMBER_REGEX.test(p.account_number) || !p.bank_code) {
      toast({ title: "Select a bank first", description: "Enter a valid 10-digit account number and select the bank to verify.", variant: "destructive" });
      return;
    }
    updateP(p.id, { resolve_status: "loading", resolve_error: "", resolved_account_name: "" });
    try {
      const { data, error } = await supabase.functions.invoke("paystack-resolve-account", {
        body: { account_number: p.account_number, bank_code: p.bank_code },
      });
      if (error) throw error;
      if (!data?.ok) {
        updateP(p.id, { resolve_status: "error", resolve_error: data?.error || "Could not verify this account." });
        return;
      }
      updateP(p.id, { resolve_status: "verified", resolved_account_name: data.account_name, resolve_error: "" });
    } catch (e: any) {
      updateP(p.id, { resolve_status: "error", resolve_error: e?.message || "Verification failed. Try again." });
    }
  };


  const addParticipant = () => {
    const np = emptyParticipant();
    setParticipants((ps) => [...ps, np]);
    setExpanded(np.id);
  };

  const removeParticipant = (id: string) =>
    setParticipants((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps));

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!collector.trim()) return "Enter the name of the data collector.";
      if (!trainingType) return "Select the type of training/meeting.";
      if (!center.trim()) return "Enter the training center/cluster.";
    }
    if (step === 1) {
      for (let i = 0; i < participants.length; i++) {
        const err = validateParticipant(participants[i]);
        if (err) { setExpanded(participants[i].id); return `Participant #${i + 1}: ${err}`; }
      }
    }
    if (step === 2) {
      if (files.length === 0) return "Please attach at least one attendance sheet / bank details photo.";
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) { toast({ title: "Check your entries", description: err, variant: "destructive" }); return; }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    scrollToAppTop("auto");
  };
  const back = () => { setStep((s) => Math.max(s - 1, 0)); scrollToAppTop("auto"); };

  const handleSubmit = async () => {
    if (!user) { toast({ title: "Sign in required", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      // Capture GPS (best-effort)
      let location: { lat: number; lng: number; accuracy?: number } | null = null;
      try {
        location = await new Promise((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            () => resolve(null), { timeout: 6000 }
          );
        });
      } catch { /* ignore */ }

      // Upload documents
      const documents: { name: string; url: string; size: number }[] = [];
      for (const f of files) {
        const path = `${user.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("uprp-uploads").upload(path, f, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("uprp-uploads").getPublicUrl(path);
        documents.push({ name: f.name, url: pub.publicUrl, size: f.size });
      }

      const { error } = await supabase.from("uprp_submissions").insert({
        user_id: user.id,
        project_id: projectId ?? null,
        name_of_data_collector: collector.trim(),
        type_of_training: trainingType,
        training_center: center.trim(),
        participants: participants as any,
        documents: documents as any,
        location: location as any,
      } as any);
      if (error) throw error;
      setSubmitted(true);
      toast({ title: "Submission saved", description: `${participants.length} participant(s) registered.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Submission Complete</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {participants.length} participant registration{participants.length === 1 ? "" : "s"} and payment details were saved successfully.
        </p>
        <Button onClick={onClose} className="mt-6 w-full bg-emerald-700 hover:bg-emerald-800">Back to Forms</Button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F4F8F5]">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-800 to-emerald-700 px-4 pb-6 pt-4 text-white">
        <button onClick={onClose} className="mb-3 inline-flex items-center gap-1.5 text-sm text-emerald-100 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Forms
        </button>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-emerald-100">NTD | WASH | Public Health</p>
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium">Step {step + 1} of {STEPS.length}</span>
        </div>
        <h1 className="mt-1 text-lg font-bold leading-tight">Participants Bank Details Verification Form</h1>
        <p className="mt-1 text-xs text-emerald-100/90">Capture participant attendance and payment details for stronger program accountability.</p>
        {/* Stepper */}
        <div className="mt-4 flex items-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= step ? "bg-white text-emerald-700" : "bg-white/20 text-white"}`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`mx-1 h-0.5 flex-1 ${i < step ? "bg-white" : "bg-white/20"}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {/* STEP 1 */}
        {step === 0 && (
          <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-foreground">
              <ClipboardList className="h-5 w-5 text-emerald-600" /> Identification
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">Data collector & training details</p>
            <div className="space-y-4">
              <Field label="Name of Data Collector" required>
                <Input value={collector} onChange={(e) => setCollector(e.target.value)} placeholder="e.g. Amina Yusuf" />
              </Field>
              <Field label="Type of Training/Meeting" required>
                <Select value={trainingType} onValueChange={setTrainingType}>
                  <SelectTrigger><SelectValue placeholder="Select training type" /></SelectTrigger>
                  <SelectContent>{TRAINING_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Name of Training Center/Cluster" required>
                <Input value={center} onChange={(e) => setCenter(e.target.value)} placeholder="e.g. Kano State – Dala Cluster" />
              </Field>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 1 && (
          <div className="space-y-3">
            {participants.map((p, idx) => {
              const open = expanded === p.id;
              const showDis = p.has_disability === "yes";
              const showOther = showDis && p.disability_type === "others";
              const bankSuggestions = suggestBanksFromAccount(p.account_number);
              return (
                <div key={p.id} className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
                  <button onClick={() => setExpanded(open ? "" : p.id)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-emerald-50/50">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100"><UserIcon className="h-5 w-5 text-emerald-600" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-emerald-800">{p.name || `Participant #${idx + 1}`}</p>
                      <p className="text-[11px] text-muted-foreground">Tap to {open ? "collapse" : "expand"}</p>
                    </div>
                    {participants.length > 1 && (
                      <span onClick={(e) => { e.stopPropagation(); removeParticipant(p.id); }} className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></span>
                    )}
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                  </button>
                  {open && (
                    <div className="space-y-4 border-t border-emerald-50 p-4">
                      <Field label="Designation of Participant" required>
                        <Select value={p.designation} onValueChange={(v) => updateP(p.id, { designation: v, state: "", lga: "", ward: "", flhf_name: "", community_name: "" })}>
                          <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                          <SelectContent>{DESIGNATIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                      <ParticipantGeoCascade participant={p} onChange={(patch) => updateP(p.id, patch)} />
                      <Field label="Name of Participant on the Attendance Sheet" required>
                        <Input value={p.name} onChange={(e) => updateP(p.id, { name: e.target.value })} placeholder="Full name" />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Sex" required>
                          <Select value={p.sex} onValueChange={(v) => updateP(p.id, { sex: v })}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>{SEXES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </Field>
                        <Field label="Phone Number">
                          <Input value={p.phone} onChange={(e) => updateP(p.id, { phone: e.target.value })} placeholder="0803 123 4567"
                            className={p.phone && !PHONE_REGEX.test(p.phone.trim()) ? "border-red-400" : ""} />
                        </Field>
                      </div>
                      <Field label="Does Participant Have a Disability?" required>
                        <div className="grid grid-cols-2 gap-2">
                          {["no", "yes"].map((v) => (
                            <button key={v} type="button" onClick={() => updateP(p.id, { has_disability: v, disability_type: v === "yes" ? p.disability_type : "", other_disability: "" })}
                              className={`flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium capitalize ${p.has_disability === v ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-input text-muted-foreground"}`}>
                              {p.has_disability === v && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{v}
                            </button>
                          ))}
                        </div>
                      </Field>
                      {showDis && (
                        <Field label="Disability Type" required>
                          <Select value={p.disability_type} onValueChange={(v) => updateP(p.id, { disability_type: v, other_disability: v === "others" ? p.other_disability : "" })}>
                            <SelectTrigger><SelectValue placeholder="Select disability type" /></SelectTrigger>
                            <SelectContent>{DISABILITY_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </Field>
                      )}
                      {showOther && (
                        <Field label="Other Disability Description" required>
                          <Input value={p.other_disability} onChange={(e) => updateP(p.id, { other_disability: e.target.value })} placeholder="Describe the disability" />
                        </Field>
                      )}
                      {/* Payment */}
                      <div className="rounded-lg bg-emerald-50/60 p-3">
                        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800"><Wallet className="h-4 w-4" /> Payment Details</p>
                        <div className="space-y-3">
                          <Field label="Account Name" required hint="Account name must match the participant's name on the attendance sheet.">
                            <Input value={p.account_name} onChange={(e) => updateP(p.id, { account_name: e.target.value })} placeholder="Account holder name"
                              className={p.account_name && p.account_name.trim().toLowerCase() !== p.name.trim().toLowerCase() ? "border-red-400" : ""} />
                          </Field>
                          <Field label="Account Number" required
                            hint={
                              p.account_number.length === 10
                                ? bankSuggestions.length > 0
                                  ? `Valid NUBAN — ${bankSuggestions.length} possible bank${bankSuggestions.length === 1 ? "" : "s"} detected. Tap to confirm below.`
                                  : "No matching Nigerian bank found for this account number."
                                : p.account_number.length > 0
                                  ? `${10 - p.account_number.length} more digit(s) needed.`
                                  : undefined
                            }>
                            <Input value={p.account_number} placeholder="10-digit account number" inputMode="numeric"
                              onChange={(e) => {
                                const num = e.target.value.replace(/\D/g, "").slice(0, 10);
                                const sugs = suggestBanksFromAccount(num);
                                // Auto-select only when exactly one bank matches.
                                const single = sugs.length === 1 ? valueForName(sugs[0].name) : null;
                                updateP(p.id, { account_number: num, ...(single ? { bank_name: single } : {}) });
                              }}
                              className={p.account_number && !ACCOUNT_NUMBER_REGEX.test(p.account_number) ? "border-red-400" : ""} />
                          </Field>
                          {bankSuggestions.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-medium text-emerald-700">Suggested bank{bankSuggestions.length === 1 ? "" : "s"} (tap to select):</p>
                              <div className="flex flex-wrap gap-1.5">
                                {bankSuggestions.slice(0, 6).map((b) => {
                                   const knownVal = valueForName(b.name);
                                   const active = p.bank_name === knownVal;
                                   return (
                                     <button key={b.code} type="button"
                                       onClick={async () => {
                                         // Persist suggested bank if it's not already in the list, then select it.
                                         const val = await addBank(b.name, b.code);
                                         updateP(p.id, { bank_name: val, bank_code: b.code, resolve_status: "idle", resolved_account_name: "", resolve_error: "" });
                                       }}
                                       className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${active ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"}`}>
                                       {b.name.replace(/\s*\(.*\)$/, "")}
                                     </button>
                                   );
                                 })}
                               </div>
                             </div>
                           )}
                           <Field label="Bank Name" required>
                             <Select value={p.bank_name} onValueChange={(v) => {
                               const match = bankSuggestions.find((b) => valueForName(b.name) === v);
                               updateP(p.id, { bank_name: v, bank_code: match?.code || p.bank_code, resolve_status: "idle", resolved_account_name: "", resolve_error: "" });
                             }}>
                               <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                               <SelectContent>{banks.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                             </Select>
                           </Field>

                          {/* Account verification (Paystack Resolve Account) */}
                          {ACCOUNT_NUMBER_REGEX.test(p.account_number) && p.bank_code && (() => {
                            const resolved = p.resolved_account_name || "";
                            const tallies =
                              !!resolved &&
                              (normName(resolved) === normName(p.name) ||
                                normName(resolved) === normName(p.account_name));
                            return (
                              <div className="space-y-2">
                                <Button type="button" variant="outline" size="sm"
                                  disabled={p.resolve_status === "loading"}
                                  onClick={() => resolveAccount(p)}
                                  className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                                  {p.resolve_status === "loading"
                                    ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Verifying account…</>
                                    : <><ShieldCheck className="mr-1.5 h-4 w-4" /> {resolved ? "Re-verify Account Name" : "Verify Account Name"}</>}
                                </Button>

                                {p.resolve_status === "verified" && resolved && (
                                  <>
                                    <Field label="Verified Account Name (read-only)">
                                      <Input value={resolved} readOnly tabIndex={-1}
                                        className="cursor-not-allowed bg-emerald-50/70 font-semibold text-emerald-900" />
                                    </Field>
                                    {tallies ? (
                                      <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 shadow-sm">
                                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                                        <div>
                                          <p className="text-sm font-bold text-emerald-800">Account name matches ✓</p>
                                          <p className="text-[12px] leading-snug text-emerald-700">The verified bank account holder matches the participant. You may proceed.</p>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 shadow-sm">
                                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                                        <div className="space-y-1">
                                          <p className="text-sm font-bold text-amber-800">Names do not tally — please reconcile</p>
                                          <p className="text-[12px] leading-snug text-amber-700">
                                            The verified account name <span className="font-semibold">“{resolved}”</span> does not match the attendance name
                                            <span className="font-semibold"> “{p.name || "—"}”</span> or the entered account name
                                            <span className="font-semibold"> “{p.account_name || "—"}”</span>. Confirm the correct details before continuing.
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}

                                {p.resolve_status === "error" && (
                                  <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-3.5 shadow-sm">
                                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                                    <div>
                                      <p className="text-sm font-bold text-red-700">Verification failed</p>
                                      <p className="text-[12px] leading-snug text-red-600">{p.resolve_error}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <Button variant="outline" onClick={addParticipant} className="w-full border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <Plus className="mr-1.5 h-4 w-4" /> Add Another Participant
            </Button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 2 && (
          <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-foreground"><ImagePlus className="h-5 w-5 text-emerald-600" /> Attendance Sheet & Bank Details Upload</h2>
            <p className="mb-4 text-xs text-muted-foreground">Snap & attach all pages of the attendance sheet and bank details.</p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center hover:bg-emerald-50">
              <Upload className="h-8 w-8 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-700">Tap to upload or take a photo</span>
              <span className="text-[11px] text-muted-foreground">JPG, PNG up to 10MB each</span>
              <input type="file" accept="image/*" multiple capture="environment" className="hidden"
                onChange={(e) => { const fs = Array.from(e.target.files || []).filter((f) => f.size <= 10 * 1024 * 1024); setFiles((p) => [...p, ...fs]); }} />
            </label>
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-foreground">Uploaded Files ({files.length})</p>
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-emerald-50 bg-emerald-50/40 p-2.5">
                    <img src={URL.createObjectURL(f)} alt={f.name} className="h-10 w-10 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{f.name}</p>
                      <p className="text-[11px] text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 4 */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-foreground"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Review & Submit</h2>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Data Collector</dt><dd className="font-medium">{collector}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Training Type</dt><dd className="font-medium">{labelOf(TRAINING_TYPES, trainingType)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Center/Cluster</dt><dd className="font-medium">{center}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Participants</dt><dd className="font-medium">{participants.length}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Documents</dt><dd className="font-medium">{files.length}</dd></div>
              </dl>
            </div>
            {participants.map((p, i) => (
              <div key={p.id} className="rounded-lg border border-emerald-50 bg-white p-3 text-sm shadow-sm">
                <p className="font-semibold text-emerald-800">#{i + 1} · {p.name}</p>
                <p className="text-xs text-muted-foreground">{labelOf(DESIGNATIONS, p.designation)} · {labelOf(SEXES, p.sex)} · {labelOf(banks, p.bank_name)} · {p.account_number}</p>
              </div>
            ))}
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center gap-3 pt-2">
          {step > 0 && (
            <Button variant="outline" onClick={back} className="flex-1"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} className="flex-1 bg-emerald-700 hover:bg-emerald-800">Next <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-emerald-700 hover:bg-emerald-800">
              {submitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Submitting…</> : <>Submit <Check className="ml-1.5 h-4 w-4" /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UPRPForm;
