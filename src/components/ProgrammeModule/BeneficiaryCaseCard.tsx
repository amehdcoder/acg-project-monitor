import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import JsBarcode from "jsbarcode";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileDown, Printer, QrCode, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveMediaUrl } from "@/lib/programmeModule/media";
import { toast } from "@/hooks/use-toast";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import handsEmblem from "@/assets/hands-emblem.png";
import fgnEmblem from "@/assets/fgn-emblem.png";
import ecwaLogo from "@/assets/ecwa-logo.png";
import cbmLogo from "@/assets/cbm-logo.png";
import { Eye, Footprints, Brain, Droplets, TrendingUp, Phone, CheckCircle2 } from "lucide-react";

// The hand card is a printed artefact, so it uses a fixed print palette
// (inline styles) rather than app theme tokens — it must look identical in
// light/dark mode and when exported.
const NAVY = "#123a7a";
const ORANGE = "#f26b1d";
const RED = "#d62828";
const GREEN = "#1f8a3b";

const pick = (p: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const v = p?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
};
const fmtDate = (v: string) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const toDataUrl = async (url: string) => {
  if (!url || url.startsWith("data:")) return url;
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
  } catch { return ""; }
};

const Barcode = ({ value }: { value: string }) => {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) {
      try { JsBarcode(ref.current, value, { format: "CODE128", height: 52, width: 1.4, displayValue: true, fontSize: 13, margin: 0, background: "transparent" }); } catch { /* ignore */ }
    }
  }, [value]);
  return <svg ref={ref} style={{ width: "100%", height: "auto", maxWidth: 280 }} />;
};

const Row = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", borderBottom: "1px solid #e3e8f2", fontSize: 14, lineHeight: 1.6, overflowWrap: "anywhere" }}>
    <div style={{ padding: "7px 12px", fontWeight: 700, color, borderRight: "1px solid #e3e8f2" }}>{label}</div>
    <div style={{ padding: "7px 12px", color: NAVY }}>{value || "None reported"}</div>
  </div>
);

/** Digital Beneficiary Hand Card (front + back) with QR + barcode, downloadable. */
const BeneficiaryCaseCard = ({ beneficiary: b }: { beneficiary: BeneficiaryRow }) => {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState("");
  const [facility, setFacility] = useState("");
  const [busy, setBusy] = useState<"" | "png" | "pdf">("");
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const url = `${window.location.origin}/cases?case=${encodeURIComponent(b.case_id)}`;
  const p = (b.profile || {}) as Record<string, unknown>;

  useEffect(() => {
    if (!open) return;
    let off = false;
    void (async () => {
      const u = await resolveMediaUrl(b.photo_url || pick(p, ["photo", "patient_photo", "portrait"]));
      const d = await toDataUrl(u);
      if (!off) setPhoto(d);
      const fid = b.facility_id || b.referring_facility_id;
      if (fid) {
        const { data } = await supabase.from("health_facilities").select("name").eq("id", fid).maybeSingle();
        if (!off) setFacility((data as { name?: string } | null)?.name || "");
      }
    })();
    return () => { off = true; };
  }, [open, b.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dob = fmtDate(pick(p, ["date_of_birth", "dob"]));
  const age = pick(p, ["age"]);
  const sex = pick(p, ["gender", "sex"]);
  const blood = pick(p, ["blood_group", "blood_type"]);
  const phone = pick(p, ["phone", "phone_number", "telephone"]);
  const facilityName = facility || pick(p, ["facility", "facility_name", "hospital"]) || "HANDS-supported facility";
  const address = pick(p, ["address"]) || [b.village, b.ward, b.lga, b.state].filter(Boolean).join(", ");
  const kin = pick(p, ["next_of_kin", "next_of_kin_name", "caregiver_name", "household_head_name"]);
  const kinRel = pick(p, ["next_of_kin_relationship", "caregiver_relationship"]);

  const capture = async () => {
    await document.fonts?.ready;
    // Render from an unscaled clone so the export matches the on-screen card pixel-for-pixel.
    const opts = {
      scale: 3, backgroundColor: null, useCORS: true, logging: false,
      onclone: (doc: Document) => {
        const w = doc.querySelector<HTMLElement>("[data-card-stage]");
        if (w) { w.style.transform = "none"; w.style.zoom = "1"; w.style.width = "1464px"; w.style.height = "auto"; }
      },
    };
    const front = frontRef.current;
    const back = backRef.current;
    if (!front || !back) throw new Error("Open the hand card before downloading.");
    await Promise.all(Array.from(front.parentElement?.querySelectorAll("img") || []).map((img) => img.decode().catch(() => {})));
    const f = await html2canvas(front, opts);
    const k = await html2canvas(back, opts);
    return [f, k];
  };
  const downloadPng = async () => {
    setBusy("png");
    try {
      const [f, k] = await capture();
      const c = document.createElement("canvas");
      c.width = f.width + k.width + 40; c.height = Math.max(f.height, k.height);
      const ctx = c.getContext("2d"); if (!ctx) throw new Error("Image export is unavailable."); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(f, 0, 0); ctx.drawImage(k, f.width + 40, 0);
      const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `${b.case_id}-hand-card.png`; a.click();
    } catch (e) { toast({ title: "Download failed", description: String(e), variant: "destructive" }); }
    setBusy("");
  };
  const downloadPdf = async () => {
    setBusy("pdf");
    try {
      const [f, k] = await capture();
      const w = 105, h = (f.height / f.width) * w, backHeight = (k.height / k.width) * w; // A6-width card, true aspect
      const pdf = new jsPDF({ unit: "mm", format: [w + 10, h + 10], orientation: "portrait" });
      pdf.addImage(f.toDataURL("image/png"), "PNG", 5, 5, w, h, undefined, "NONE");
      pdf.addPage([w + 10, backHeight + 10], "portrait");
      pdf.addImage(k.toDataURL("image/png"), "PNG", 5, 5, w, backHeight, undefined, "NONE");
      pdf.save(`${b.case_id}-hand-card.pdf`);
    } catch (e) { toast({ title: "Download failed", description: String(e), variant: "destructive" }); }
    setBusy("");
  };
  const print = async () => {
    try {
    const [f, k] = await capture();
    const w = window.open("", "_blank"); if (!w) return;
    const printWidth = Math.min(132, 190 * 720 / Math.max(f.height / 3, k.height / 3));
    w.document.write(`<html><head><title>Beneficiary Hand Card</title></head><style>@page{size:A4 landscape;margin:8mm}html,body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.s{display:flex;gap:8mm;justify-content:center;align-items:flex-start}.s img{width:${printWidth}mm;height:auto}</style><body><div class="s"><img src="${f.toDataURL()}"/><img src="${k.toDataURL()}"/></div><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
    } catch (e) { toast({ title: "Print failed", description: String(e), variant: "destructive" }); }
  };

  const card: React.CSSProperties = { WebkitPrintColorAdjust: "exact", width: 720, minHeight: 960, display: "flex", flexDirection: "column", lineHeight: 1.5, overflowWrap: "anywhere", borderRadius: 26, overflow: "hidden", background: "#fff", fontFamily: "'Plus Jakarta Sans', Arial, sans-serif", position: "relative", boxShadow: "0 0 0 1px #dfe5ef", flexShrink: 0 };
  const stripe = `linear-gradient(90deg, ${ORANGE}, #f4a11d 50%, ${GREEN})`;

  return (
    <>
      <Button size="sm" variant="outline" className="mt-1 h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <QrCode className="h-3.5 w-3.5" /> Hand card
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
          <DialogHeader><DialogTitle>Beneficiary Hand Card</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-1" onClick={downloadPng} disabled={!!busy}>{busy === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download image</Button>
            <Button variant="outline" className="gap-1" onClick={downloadPdf} disabled={!!busy}>{busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Download PDF</Button>
            <Button variant="outline" className="gap-1" onClick={print} disabled={!!busy}><Printer className="h-4 w-4" /> Print</Button>
          </div>
          <div className="overflow-x-auto rounded-lg bg-muted/40 p-3">
            <div data-card-stage style={{ display: "flex", gap: 24, zoom: 0.62, alignItems: "stretch", width: 1464 }}>
              {/* FRONT */}
              <div ref={frontRef} style={card}>
                <div style={{ display: "grid", gridTemplateColumns: "180px 1px 170px 1px 125px 1px minmax(0,1fr)", alignItems: "center", padding: "16px 22px", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <img src={handsEmblem} style={{ height: 66, width: 44, objectFit: "contain" }} />
                    <div><div style={{ fontWeight: 800, fontSize: 26, color: NAVY, lineHeight: 1.3 }}>HANDS</div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0, color: NAVY }}>TRANSFORMING LIVES</div></div>
                  </div>
                  <div style={{ width: 1, height: 70, background: "#c9d4e6" }} />
                  <img src={ecwaLogo} style={{ height: 66, width: "100%", objectFit: "contain" }} />
                  <div style={{ width: 1, height: 70, background: "#c9d4e6" }} />
                  <img src={cbmLogo} style={{ height: 80, width: "100%", objectFit: "contain" }} />
                  <div style={{ width: 1, height: 70, background: "#c9d4e6" }} />
                  <div style={{ textAlign: "center", minWidth: 0 }}><img src={fgnEmblem} style={{ height: 58, width: "100%", objectFit: "contain" }} /><div style={{ fontSize: 8, fontWeight: 700, color: GREEN }}>FEDERAL MINISTRY OF HEALTH</div></div>
                </div>
                <div style={{ height: 6, background: stripe }} />
                <div style={{ background: `linear-gradient(120deg, ${NAVY}, #1d5bb5)`, color: "#fff", padding: "18px 32px", borderBottomRightRadius: 80 }}>
                  <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 0, lineHeight: 1.3 }}>BENEFICIARY HAND CARD</div>
                  <div style={{ fontSize: 20, marginTop: 6, opacity: 0.95 }}>Your Health • Your Records • Always With You</div>
                  <div style={{ fontSize: 14, marginTop: 4, opacity: 0.85 }}>{facilityName} • Longitudinal Beneficiary Record</div>
                </div>
                <div style={{ height: 6, background: stripe, width: "70%" }} />
                <div style={{ display: "grid", gridTemplateColumns: "170px minmax(0, 1fr) 196px", gap: 16, padding: "24px 28px" }}>
                  <div style={{ width: 170, height: 230, borderRadius: 14, border: `4px solid ${ORANGE}`, overflow: "hidden", background: "#eef2f8", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {photo ? <img src={photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 64, fontWeight: 800, color: NAVY }}>{b.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</span>}
                  </div>
                  <div style={{ flex: 1, color: NAVY, minWidth: 0 }}>
                    <div style={{ fontSize: 25, fontWeight: 800, lineHeight: 1.4 }}>{b.full_name}</div>
                    <div style={{ color: RED, fontWeight: 700, fontSize: 15, marginTop: 4, fontFamily: "monospace" }}>{b.case_id}</div>
                    <div style={{ fontSize: 13, marginBottom: 12 }}>Unique Patient ID</div>
                    {[["Date of Birth", dob || (age ? `${age} yrs` : "—")], ["Sex", sex || "—"], ["Blood Group", blood || "—"], ["Phone Number", phone || "—"]].map(([l, v]) => (
                      <div key={l} style={{ marginBottom: 8 }}><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 12, opacity: 0.8 }}>{l}</div></div>
                    ))}
                  </div>
                  <div style={{ width: 196, flexShrink: 0, textAlign: "center" }}>
                    <div style={{ border: `3px solid ${NAVY}`, borderRadius: 12, padding: 10, background: "#fff" }}>
                      <QRCodeSVG value={url} size={166} level="H" fgColor={NAVY} imageSettings={{ src: handsEmblem, height: 36, width: 36, excavate: true }} />
                      <div style={{ background: NAVY, color: "#fff", borderRadius: 999, fontWeight: 800, padding: "6px 0", marginTop: 6 }}>SCAN ME</div>
                    </div>
                    <div style={{ fontSize: 12, color: NAVY, marginTop: 6 }}>Access my health records on <b>Amehnities</b></div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 20px 24px", textAlign: "center", gap: 12 }}>
                  {([[Eye, "Integrated Eye Health", "#1d5bb5"], [Footprints, "MMDP / NTD", GREEN], [Brain, "Mental Health & Psychosocial", ORANGE], [Droplets, "Inclusive WASH", "#7b2cbf"], [TrendingUp, "Livelihood & Empowerment", RED]] as const).map(([I, l, c]) => (
                    <div key={l} style={{ width: 120 }}>
                      <div style={{ width: 74, height: 74, margin: "0 auto", borderRadius: "50%", background: c, display: "flex", alignItems: "center", justifyContent: "center" }}><I size={38} color="#ffffff" strokeWidth={2} /></div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: c, marginTop: 6 }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "auto", flexShrink: 0 }}>
                  <div style={{ height: 6, background: stripe }} />
                  <div style={{ background: NAVY, color: "#fff", padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>Inclusive Services<br />Brighter Futures</div>
                    <div style={{ fontSize: 12, textAlign: "right", maxWidth: 330 }}>This card is valid at {facilityName} and all HANDS-supported health facilities.</div>
                  </div>
                </div>
              </div>

              {/* BACK */}
              <div ref={backRef} style={card}>
                <div style={{ background: `linear-gradient(120deg, ${NAVY}, #1d5bb5)`, color: "#fff", padding: "22px 28px", fontSize: 24, textAlign: "center" }}>Present this card at every visit</div>
                <div style={{ height: 6, background: stripe }} />
                <div style={{ margin: "20px 24px", border: "1px solid #c9d4e6", borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ background: NAVY, color: "#fff", fontSize: 24, fontWeight: 800, padding: "12px 16px" }}>Medical Information</div>
                  <Row label="Primary Condition" value={pick(p, ["primary_condition_other", "primary_condition"])} color={RED} />
                  <Row label="Known Allergies" value={pick(p, ["allergies", "known_allergies"])} color={RED} />
                  <Row label="Chronic Conditions" value={pick(p, ["chronic_conditions", "comorbidities"])} color={GREEN} />
                  <Row label="Regular Medications" value={pick(p, ["medications", "regular_medications"])} color="#1d5bb5" />
                  <Row label="Next of Kin" value={kin ? `${kin}${kinRel ? ` (${kinRel})` : ""}` : ""} color={ORANGE} />
                  <Row label="Next of Kin Phone" value={pick(p, ["next_of_kin_phone", "caregiver_phone"])} color={RED} />
                  <Row label="Address" value={address} color={NAVY} />
                  <Row label="Facility of Registration" value={facilityName} color={GREEN} />
                  <Row label="Date of Registration" value={fmtDate(b.created_at)} color={ORANGE} />
                </div>
                <div style={{ margin: "0 24px", borderRadius: 14, background: "#fde8e8", border: `1px solid ${RED}55`, padding: "12px 18px", color: RED }}>
                  <div style={{ fontSize: 24, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}><Phone size={24} color={RED} strokeWidth={2.5} /> IN CASE OF EMERGENCY</div>
                  <div style={{ fontSize: 15 }}>Please contact the next of kin or the nearest health facility.</div>
                </div>
                <div style={{ display: "flex", gap: 16, margin: "18px 24px" }}>
                  <div style={{ flex: 1, minWidth: 0, border: `1px solid ${GREEN}66`, background: "#f1faf3", borderRadius: 14, padding: "12px 16px", color: NAVY, fontSize: 13 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={22} color={GREEN} strokeWidth={2.5} /> Important Information</div>
                    {["Keep this card safe and bring it to every visit.", "The QR code and barcode carry your unique Case ID for Amehnities access.", "Do not share this card with anyone.", "Report if lost or damaged.", `Valid at ${facilityName} and all HANDS-supported health facilities.`].map((t) => <div key={t} style={{ marginBottom: 4 }}>• {t}</div>)}
                  </div>
                  <div style={{ width: 250, minWidth: 0, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, color: NAVY, fontSize: 16, textAlign: "center" }}>Stronger Communities<br />Healthier Nigeria</div>
                    <Barcode value={b.case_id} />
                  </div>
                </div>
                <div style={{ marginTop: "auto", flexShrink: 0, background: NAVY, color: "#fff", padding: "16px 24px", fontSize: 13, textAlign: "center" }}>
                  <div>www.handsnigeria.org  |  info@amehnities.org</div>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>People | Inclusion | Equity | Impact</div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BeneficiaryCaseCard;
