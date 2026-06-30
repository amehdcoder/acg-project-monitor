import { useMemo, useState } from "react";
import {
  ChevronDown, Images, FileCheck2, Download, ShieldCheck, Loader2, MapPin, ImageIcon, FileText, FileArchive,
} from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IRF_CATEGORY_FORMS } from "@/lib/irf/categoryForms";
import type { IrfReport } from "@/lib/irf/definition";

interface Props { rows: IrfReport[]; }

interface EvidenceItem {
  path: string;
  caption?: string | null;
  informed_consent?: boolean;
  consent?: boolean;
  consent_form_path?: string | null;
  consent_form_name?: string | null;
  consented_at?: string | null;
}

const formName = (id?: string | null) => IRF_CATEGORY_FORMS.find((f) => f.id === id)?.short || "Activity";
const formColor = (id?: string | null) => IRF_CATEGORY_FORMS.find((f) => f.id === id)?.color || "#0891b2";

const safe = (s: string) => String(s || "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const baseName = (p: string) => p.split("/").pop() || p;

/** Resolve a signed URL and fetch the file as a Blob. */
async function fetchBlob(path: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from("irf-evidence").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  try {
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Download a single stored file directly to the device. */
async function downloadOne(path: string, filename?: string) {
  const blob = await fetchBlob(path);
  if (!blob) {
    toast.error("Could not download file — it may have been removed or access is restricted.");
    return false;
  }
  saveAs(blob, filename || baseName(path));
  return true;
}

async function openSigned(path: string) {
  const { data, error } = await supabase.storage.from("irf-evidence").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    toast.error("Could not open file — it may have been removed or access is restricted.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}


export default function IrfEvidenceLibrary({ rows }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reportsWithEvidence = useMemo(
    () =>
      rows
        .map((r) => ({ r, items: (Array.isArray(r.evidence) ? r.evidence : []) as EvidenceItem[] }))
        .filter((x) => x.items.length > 0)
        .sort((a, b) => (b.r.created_at || "").localeCompare(a.r.created_at || "")),
    [rows],
  );

  const totals = useMemo(() => {
    let pictures = 0, consents = 0;
    reportsWithEvidence.forEach(({ items }) => {
      pictures += items.length;
      consents += items.filter((i) => i.consent_form_path).length;
    });
    return { pictures, consents, activities: reportsWithEvidence.length };
  }, [reportsWithEvidence]);

  /** Zip every picture + consent form for a single activity report. */
  const downloadAll = async (r: IrfReport, items: EvidenceItem[], key: string) => {
    setBusy(key);
    try {
      const zip = new JSZip();
      let added = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        // eslint-disable-next-line no-await-in-loop
        const pic = await fetchBlob(it.path);
        if (pic) { zip.file(`picture-${i + 1}-${baseName(it.path)}`, pic); added++; }
        if (it.consent_form_path) {
          // eslint-disable-next-line no-await-in-loop
          const con = await fetchBlob(it.consent_form_path);
          if (con) { zip.file(`consent-${i + 1}-${it.consent_form_name || baseName(it.consent_form_path)}`, con); added++; }
        }
      }
      if (!added) { toast.error("No files could be downloaded (access may be restricted)."); return; }
      const blob = await zip.generateAsync({ type: "blob" });
      const label = `${safe(formName(r.form_category))}-${safe([r.lga, r.state].filter(Boolean).join("-") || "evidence")}`;
      saveAs(blob, `${label}.zip`);
      toast.success(`Downloaded ${added} file(s) as a ZIP.`);
    } catch {
      toast.error("Download failed. Please try again.");
    } finally { setBusy(null); }
  };

  /** Zip the entire evidence library across all activities. */
  const downloadEverything = async () => {
    setBusy("__all__");
    try {
      const zip = new JSZip();
      let added = 0;
      for (const { r, items } of reportsWithEvidence) {
        const folder = zip.folder(`${safe(formName(r.form_category))}-${safe([r.lga, r.state].filter(Boolean).join("-") || r.id.slice(0, 6))}`)!;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          // eslint-disable-next-line no-await-in-loop
          const pic = await fetchBlob(it.path);
          if (pic) { folder.file(`picture-${i + 1}-${baseName(it.path)}`, pic); added++; }
          if (it.consent_form_path) {
            // eslint-disable-next-line no-await-in-loop
            const con = await fetchBlob(it.consent_form_path);
            if (con) { folder.file(`consent-${i + 1}-${it.consent_form_name || baseName(it.consent_form_path)}`, con); added++; }
          }
        }
      }
      if (!added) { toast.error("No files could be downloaded (access may be restricted)."); return; }
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `SAIRF-evidence-library-${new Date().toISOString().slice(0, 10)}.zip`);
      toast.success(`Downloaded ${added} file(s) as a ZIP.`);
    } catch {
      toast.error("Download failed. Please try again.");
    } finally { setBusy(null); }
  };


  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-3 border-b p-4 text-left transition hover:bg-muted/40">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow">
              <Images className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">Evidence Library — Activity Pictures &amp; Consent Forms</h3>
              <p className="text-xs text-muted-foreground">
                {totals.activities} activit{totals.activities === 1 ? "y" : "ies"} · {totals.pictures} picture(s) · {totals.consents} consent form(s)
              </p>
            </div>
            <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {reportsWithEvidence.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <p className="text-sm">No activity pictures have been uploaded yet.</p>
            </div>
          ) : (
            <div className="max-h-[560px] space-y-3 overflow-y-auto p-4">
              {reportsWithEvidence.map(({ r, items }) => {
                const color = formColor(r.form_category);
                return (
                  <div key={r.id} className="rounded-xl border" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {formName(r.form_category)}
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {[r.lga, r.state].filter(Boolean).join(", ") || "—"}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.reporting_period || (r.reporting_month || "").slice(0, 7)} · {items.length} picture(s)
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                        disabled={busy === r.id} onClick={() => downloadAll(r, items, r.id)}>
                        {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />}
                        Download ZIP
                      </Button>

                    </div>
                    <div className="grid gap-2 p-3 sm:grid-cols-2">
                      {items.map((it, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-500/10 text-rose-500">
                            <ImageIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">{it.caption || `Picture ${i + 1}`}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              {(it.informed_consent || it.consent) && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  <ShieldCheck className="h-3 w-3" /> Consent
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Open picture" onClick={() => openSigned(it.path)}>
                              <ImageIcon className="h-4 w-4" />
                            </Button>
                            {it.consent_form_path ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" aria-label="Open consent form" onClick={() => openSigned(it.consent_form_path!)}>
                                <FileCheck2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="flex h-7 w-7 items-center justify-center text-muted-foreground/40" title="No consent form on file">
                                <FileText className="h-4 w-4" />
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
