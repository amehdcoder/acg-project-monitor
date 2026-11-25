// Entity-relationship diagram (crow's-foot notation) for the selected LBR components.
// Mermaid source (TXT/JSON) and a crisp PNG (PDF/Word/PowerPoint) come from the same schema.
import type { LbrSchema, SchemaEntity } from "./lbrApiSchema";

const safe = (id: string) => id.replace(/[^A-Za-z0-9_]/g, "_");
const mType = (t: string, f?: string) => safe(f ? `${t}_${f.replace(/-/g, "_")}` : t);
const isFk = (n: string) => n !== "id" && n !== "case_id" && /_id$/.test(n);

/** Mermaid erDiagram source — renders in GitHub, GitLab, Notion, Confluence and mermaid.live. */
export function schemaToMermaid(schema: LbrSchema): string {
  const L = ["erDiagram"];
  const svc = schema.entities.filter((e) => e.id.startsWith("ServiceData_"));
  L.push("  Beneficiary ||--|| BeneficiaryProfile : \"embeds profile\"");
  L.push("  Beneficiary ||--o{ Service : \"receives\"");
  svc.forEach((e) => L.push(`  Service ||--o| ${safe(e.id)} : "data (${e.id.slice(12)})"`));
  L.push("  WebhookEnvelope }o--|| Service : \"notifies change\"");
  L.push("  WebhookEnvelope }o--|| Beneficiary : \"notifies change\"");
  for (const e of schema.entities) {
    L.push(`  ${safe(e.id)} {`);
    for (const p of e.props) {
      const key = p.name === "id" ? " PK" : isFk(p.name) ? " FK" : p.name === "case_id" ? " UK" : "";
      L.push(`    ${mType(p.type, p.format)} ${safe(p.name)}${key}${p.required ? ' "required"' : ""}`);
    }
    if (!e.props.length) L.push("    object data");
    L.push("  }");
  }
  return L.join("\n");
}

type Box = { e: SchemaEntity; x: number; y: number; w: number; h: number };
const ACC = { navy: "#0B2545", teal: "#00897B", gold: "#E0A100" } as const;
const BW = 420, HEAD = 64, ROW = 30, MAXR = 8, GAP_X = 150, GAP_Y = 46, PAD = 48;

/** Renders the ER diagram to a PNG data URL (browser only). */
export function renderErDiagram(schema: LbrSchema): { data: string; w: number; h: number } | null {
  if (typeof document === "undefined") return null;
  const byId = (id: string) => schema.entities.find((e) => e.id === id)!;
  const height = (e: SchemaEntity) => HEAD + (Math.min(e.props.length, MAXR) + (e.props.length > MAXR ? 1 : 0) || 1) * ROW + 18;
  const boxes: Box[] = [];
  const place = (e: SchemaEntity, col: number, y: number) => { const b = { e, x: PAD + col * (BW + GAP_X), y, w: BW, h: height(e) }; boxes.push(b); return b; };
  const TOPY = PAD + 70;
  const ben = place(byId("Beneficiary"), 0, TOPY);
  const prof = place(byId("BeneficiaryProfile"), 0, ben.y + ben.h + GAP_Y * 1.6);
  const svc = place(byId("Service"), 1, TOPY);
  const hook = place(byId("WebhookEnvelope"), 1, svc.y + svc.h + GAP_Y * 1.6);
  const data = schema.entities.filter((e) => e.id.startsWith("ServiceData_"));
  const perCol = data.length;
  const dataBoxes = data.map((e, i) => {
    const col = 2 + Math.floor(i / Math.max(perCol, 1));
    const prev = boxes.filter((b) => b.x === PAD + col * (BW + GAP_X)).pop();
    return place(e, col, prev ? prev.y + prev.h + GAP_Y : TOPY);
  });
  const cols = Math.max(2, ...boxes.map((b) => Math.round((b.x - PAD) / (BW + GAP_X)) + 1));
  const W = PAD * 2 + cols * BW + (cols - 1) * GAP_X;
  const H = Math.max(...boxes.map((b) => b.y + b.h)) + PAD + 60;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, W, H);
  // subtle dot grid
  g.fillStyle = "#E6ECF2"; for (let x = 20; x < W; x += 28) for (let y = 20; y < H; y += 28) g.fillRect(x, y, 2, 2);
  g.fillStyle = "#0B2545"; g.font = "bold 30px Arial"; g.fillText("Entity-relationship diagram", PAD, PAD + 18);
  g.fillStyle = "#5B6770"; g.font = "18px Arial"; g.fillText("Crow's-foot notation · PK primary key · FK foreign key · UK unique · ● required", PAD, PAD + 48);

  const line = (pts: [number, number][], dashed = false) => {
    g.save(); g.strokeStyle = "#5B6770"; g.lineWidth = 2.4; if (dashed) g.setLineDash([9, 7]);
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.restore();
  };
  // end markers; dir = +1 if line arrives from the left (marker points right), -1 otherwise; vertical uses "v"
  const bar = (x: number, y: number, v = false) => { g.beginPath(); if (v) { g.moveTo(x - 10, y); g.lineTo(x + 10, y); } else { g.moveTo(x, y - 10); g.lineTo(x, y + 10); } g.stroke(); };
  const mark = (kind: "one" | "many" | "zeroOne" | "zeroMany", x: number, y: number, dir: 1 | -1, v = false) => {
    g.save(); g.strokeStyle = "#0B2545"; g.lineWidth = 2.4; g.fillStyle = "#FFFFFF";
    const at = (d: number): [number, number] => v ? [x, y - dir * d] : [x - dir * d, y];
    if (kind === "one") { bar(...at(10), v); bar(...at(18), v); }
    if (kind === "many" || kind === "zeroMany") {
      const [bx, by] = at(20); g.beginPath();
      if (v) { g.moveTo(bx, by); g.lineTo(x - 11, y); g.moveTo(bx, by); g.lineTo(x + 11, y); }
      else { g.moveTo(bx, by); g.lineTo(x, y - 11); g.moveTo(bx, by); g.lineTo(x, y + 11); }
      g.stroke(); bar(...at(24), v);
    }
    if (kind === "zeroOne") bar(...at(10), v);
    if (kind === "zeroOne" || kind === "zeroMany") { const [cx, cy] = at(kind === "zeroMany" ? 36 : 24); g.beginPath(); g.arc(cx, cy, 6.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.restore();
  };
  const label = (t: string, x: number, y: number) => {
    if (!t) return;
    g.font = "italic 16px Arial"; const w = g.measureText(t).width + 14;
    g.fillStyle = "#FFFFFF"; g.strokeStyle = "#D5DEE7"; g.lineWidth = 1; g.beginPath(); g.roundRect(x - w / 2, y - 13, w, 26, 6); g.fill(); g.stroke();
    g.fillStyle = "#00897B"; g.textAlign = "center"; g.fillText(t, x, y + 5); g.textAlign = "left";
  };
  const elbow = (a: Box, b: Box, from: "one", to: "many" | "zeroOne", text: string, dashed = false) => {
    const y1 = a.y + HEAD / 2 + 6, y2 = b.y + HEAD / 2 + 6, x1 = a.x + a.w, x2 = b.x, mx = x1 + (x2 - x1) / 2;
    line([[x1, y1], [mx, y1], [mx, y2], [x2, y2]], dashed); mark(from, x1, y1, -1); mark(to, x2, y2, 1);
    label(text, mx, y2 === y1 ? y1 - 22 : (y2 + Math.max(y1, a.y + 40)) / 2 + (y2 > y1 ? 0 : 0));
  };
  // Beneficiary ↔ Profile (vertical 1—1)
  { const x = ben.x + 70, y1 = ben.y + ben.h, y2 = prof.y; line([[x, y1], [x, y2]]); mark("one", x, y1, -1, true); mark("one", x, y2, 1, true); label("embeds profile", x + 90, (y1 + y2) / 2); }
  elbow(ben, svc, "one", "many", "receives 0..n");
  dataBoxes.forEach((b, i) => elbow(svc, b, "one", "zeroOne", i === 0 ? "data 0..1" : ""));
  // Webhook → Service (vertical, dashed: event refers to the changed record)
  { const x = svc.x + svc.w / 2, y1 = svc.y + svc.h, y2 = hook.y; line([[x, y1], [x, y2]], true); mark("one", x, y1, -1, true); mark("zeroMany", x, y2, 1, true); label("notifies change", x + 100, (y1 + y2) / 2); }

  for (const b of boxes) {
    const acc = ACC[b.e.accent];
    g.save(); g.shadowColor = "rgba(11,37,69,0.18)"; g.shadowBlur = 18; g.shadowOffsetY = 6;
    g.fillStyle = "#FFFFFF"; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 12); g.fill(); g.restore();
    g.strokeStyle = acc; g.lineWidth = 2; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 12); g.stroke();
    g.fillStyle = acc; g.beginPath(); g.roundRect(b.x, b.y, b.w, HEAD - 18, [12, 12, 0, 0]); g.fill();
    const fg = b.e.accent === "gold" ? "#14213D" : "#FFFFFF";
    g.fillStyle = fg; g.font = "bold 20px Arial";
    let t = b.e.title; while (g.measureText(t).width > b.w - 90 && t.length > 4) t = t.slice(0, -2); if (t !== b.e.title) t += "…";
    g.fillText(t, b.x + 16, b.y + 30);
    g.font = "bold 12px Arial"; g.textAlign = "right"; g.fillText(b.e.id.startsWith("ServiceData_") ? "EMBEDDED" : b.e.id === "BeneficiaryProfile" ? "EMBEDDED" : b.e.id === "WebhookEnvelope" ? "EVENT" : "ENTITY", b.x + b.w - 14, b.y + 30); g.textAlign = "left";
    g.fillStyle = "#5B6770"; g.font = "italic 13px Arial";
    let d = b.e.description; while (g.measureText(d).width > b.w - 28 && d.length > 4) d = d.slice(0, -2); if (d !== b.e.description) d += "…";
    g.fillText(d, b.x + 14, b.y + HEAD - 2);
    const list = b.e.props.slice(0, MAXR);
    list.forEach((p, i) => {
      const ry = b.y + HEAD + 8 + i * ROW;
      if (i % 2) { g.fillStyle = "#EEF3F8"; g.fillRect(b.x + 2, ry, b.w - 4, ROW); }
      const key = p.name === "id" ? "PK" : isFk(p.name) ? "FK" : p.name === "case_id" ? "UK" : "";
      if (key) { g.fillStyle = key === "PK" ? "#E0A100" : key === "FK" ? "#00897B" : "#0B2545"; g.beginPath(); g.roundRect(b.x + 10, ry + 7, 30, 17, 4); g.fill(); g.fillStyle = key === "PK" ? "#14213D" : "#FFFFFF"; g.font = "bold 11px Arial"; g.textAlign = "center"; g.fillText(key, b.x + 25, ry + 20); g.textAlign = "left"; }
      g.fillStyle = p.required ? acc : "#FFFFFF"; g.strokeStyle = acc; g.lineWidth = 1.5; g.beginPath(); g.arc(b.x + 52, ry + 15, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = p.required ? "#0B2545" : "#1F2933"; g.font = `${p.required ? "bold " : ""}15px Consolas, monospace`;
      let n = p.name; while (g.measureText(n).width > 200 && n.length > 4) n = n.slice(0, -2); if (n !== p.name) n += "…";
      g.fillText(n, b.x + 64, ry + 20);
      g.fillStyle = "#00897B"; g.font = "14px Consolas, monospace"; g.textAlign = "right";
      g.fillText(`${p.type}${p.format ? `<${p.format}>` : ""}${p.type === "array" ? "[]" : p.enum?.length ? " enum" : ""}`.slice(0, 22), b.x + b.w - 14, ry + 20); g.textAlign = "left";
    });
    g.fillStyle = "#5B6770"; g.font = "italic 13px Arial";
    if (!list.length) g.fillText("No additional fields configured", b.x + 16, b.y + HEAD + 28);
    if (b.e.props.length > MAXR) g.fillText(`+ ${b.e.props.length - MAXR} more fields (see schema tables)`, b.x + 16, b.y + HEAD + 8 + MAXR * ROW + 20);
  }
  g.fillStyle = "#5B6770"; g.font = "14px Arial"; g.fillText("Amehnities · Longitudinal Beneficiary Records · JSON Schema 2020-12 / OpenAPI 3.1", PAD, H - 24);
  return { data: c.toDataURL("image/png"), w: W, h: H };
}
