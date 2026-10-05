import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, QrCode } from "lucide-react";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";

/** Digital beneficiary card with a scannable QR code for the Case ID. */
const BeneficiaryCaseCard = ({ beneficiary }: { beneficiary: BeneficiaryRow }) => {
  const [open, setOpen] = useState(false);
  const url = `${window.location.origin}/cases?case=${encodeURIComponent(beneficiary.case_id)}`;

  const print = () => {
    const svg = document.getElementById("case-card-qr")?.outerHTML || "";
    const w = window.open("", "_blank", "width=420,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>${beneficiary.case_id}</title></head><body style="font-family:sans-serif;text-align:center;padding:24px">
      <div style="border:1px solid #ccc;border-radius:12px;padding:20px;display:inline-block">
      <div style="font-size:12px;letter-spacing:2px;color:#555">BENEFICIARY CARD</div>
      <h2 style="margin:8px 0">${beneficiary.full_name}</h2>${svg}
      <div style="font-family:monospace;margin-top:10px">${beneficiary.case_id}</div>
      <div style="font-size:12px;color:#555">${[beneficiary.lga, beneficiary.ward].filter(Boolean).join(" · ")}</div></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      <Button size="sm" variant="outline" className="mt-1 h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <QrCode className="h-3.5 w-3.5" /> Digital card
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Beneficiary card</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-2 rounded-lg border p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Beneficiary card</p>
            <p className="text-lg font-semibold">{beneficiary.full_name}</p>
            <div className="rounded bg-card p-3">
              <QRCodeSVG id="case-card-qr" value={url} size={200} level="M" />
            </div>
            <p className="font-mono text-sm">{beneficiary.case_id}</p>
            <p className="text-xs text-muted-foreground">{[beneficiary.lga, beneficiary.ward].filter(Boolean).join(" · ")}</p>
          </div>
          <Button className="gap-1" onClick={print}><Printer className="h-4 w-4" /> Print card</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BeneficiaryCaseCard;
