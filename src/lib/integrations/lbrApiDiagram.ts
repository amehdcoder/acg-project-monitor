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

type Box = { e: SchemaEntity; x: number; y: number; w: number; h: number; desc: string[] };
const ACC = { navy: "#0B2545", teal: "#00897B", gold: "#E0A100" } as const;
const HEAD = 46, ROW = 30, GAP_X = 130, GAP_Y = 44, PAD = 48, MINW = 420;
const F = { title: "bold 20px Arial", tag: "bold 12px Arial", desc: "italic 14px Arial", name: "bold 15px Consolas, monospace", nameN: "15px Consolas, monospace", type: "14px Consolas, monospace", label: "italic 16px Arial" };
const typeLabel = (p: { type: string; format?: string; enum?: string[] }) => `${p.type}${p.format ? `<${p.format}>` : ""}${p.type === "array" ? "[]" : p.enum?.length ? " enum" : ""}`;
const tagOf = (id: string) => id.startsWith("ServiceData_") || id === "BeneficiaryProfile" ? "EMBEDDED" : id === "WebhookEnvelope" ? "EVENT" : "ENTITY";

export type ErDiagram = { data: string; w: number; h: number; pages: { data: string; w: number; h: number }[] };

function wrap(g: CanvasRenderingContext2D, text: string, w: number): string[] {
  const out: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/**
 * Renders the complete ER diagram (every entity, every field, full text — nothing truncated).
 * `pages` splits a tall diagram into page-shaped images cut only in the gaps between boxes.
 */
export function renderErDiagram(schema: LbrSchema, pageAspect = 1.35): ErDiagram | null {
  if (typeof document === "undefined") return null;
  const m = document.createElement("canvas").getContext("2d")!;
  const measure = (font: string, t: string) => { m.font = font; return m.measureText(t).width; };
  const widthOf = (e: SchemaEntity) => Math.ceil(Math.max(MINW,
    measure(F.title, e.title) + measure(F.tag, tagOf(e.id)) + 60,
    ...e.props.map((p) => 64 + measure(p.required ? F.name : F.nameN, p.name) + 36 + measure(F.type, typeLabel(p)) + 16)));
  const byId = (id: string) => schema.entities.find((e) => e.id === id)!;
  const mk = (e: SchemaEntity, w = widthOf(e)): Box => {
    m.font = F.desc; const desc = wrap(m, e.description, w - 28);
    return { e, x: 0, y: 0, w, desc, h: HEAD + desc.length * 19 + 10 + Math.max(e.props.length, 1) * ROW + 12 };
  };
  const TOPY = PAD + 110; // leaves room for the connector bus above the boxes
  const benE = byId("Beneficiary"), profE = byId("BeneficiaryProfile");
  const c0w = Math.max(widthOf(benE), widthOf(profE));
  const ben = mk(benE, c0w), prof = mk(profE, c0w);
  const svcE = byId("Service"), hookE = byId("WebhookEnvelope");
  const c1w = Math.max(widthOf(svcE), widthOf(hookE));
  const svc = mk(svcE, c1w), hook = mk(hookE, c1w);
  ben.x = prof.x = PAD; ben.y = TOPY; prof.y = ben.y + ben.h + GAP_Y * 1.6;
  svc.x = hook.x = PAD + c0w + GAP_X; svc.y = TOPY; hook.y = svc.y + svc.h + GAP_Y * 1.6;
  const dataE = schema.entities.filter((e) => e.id.startsWith("ServiceData_"));
  const dw = Math.max(MINW, ...dataE.map((e) => widthOf(e)));
  const dataX0 = svc.x + c1w + GAP_X;
  const leftH = Math.max(prof.y + prof.h, hook.y + hook.h);
  // choose the number of data columns whose overall shape best fits a page
  let best: { boxes: Box[]; W: number; H: number; cols: number } | null = null;
  for (let k = 1; k <= Math.max(1, Math.min(4, dataE.length)); k++) {
    const colY = Array(k).fill(TOPY) as number[];
    const boxes = dataE.map((e) => { const b = mk(e, dw); const c = colY.indexOf(Math.min(...colY)); b.x = dataX0 + c * (dw + GAP_X); b.y = colY[c]; colY[c] += b.h + GAP_Y; return b; });
    const W = dataX0 + (dataE.length ? k * dw + (k - 1) * GAP_X : -GAP_X) + PAD;
    const H = Math.max(leftH, ...boxes.map((b) => b.y + b.h)) + PAD + 50;
    const score = Math.abs(Math.log((H / W) / pageAspect));
    if (!best || score < Math.abs(Math.log((best.H / best.W) / pageAspect)) - 0.02) best = { boxes, W, H, cols: k };
  }
  const { boxes: dataBoxes, W, H } = best!;
  const all = [ben, prof, svc, hook, ...dataBoxes];

  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#E6ECF2"; for (let x = 20; x < W; x += 28) for (let y = 20; y < H; y += 28) g.fillRect(x, y, 2, 2);
  g.fillStyle = "#0B2545"; g.font = "bold 30px Arial"; g.fillText("Entity-relationship diagram", PAD, PAD + 18);
  g.fillStyle = "#5B6770"; g.font = "18px Arial"; g.fillText(`Crow's-foot notation · PK primary key · FK foreign key · UK unique · ● required · ${schema.entities.length} entities · ${schema.entities.reduce((n, e) => n + e.props.length, 0)} fields`, PAD, PAD + 48);

  const line = (pts: [number, number][], dashed = false) => {
    g.save(); g.strokeStyle = "#5B6770"; g.lineWidth = 2.4; if (dashed) g.setLineDash([9, 7]);
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.restore();
  };
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
    g.font = F.label; const w = g.measureText(t).width + 16;
    g.fillStyle = "#FFFFFF"; g.strokeStyle = "#D5DEE7"; g.lineWidth = 1; g.beginPath(); g.roundRect(x - w / 2, y - 13, w, 26, 6); g.fill(); g.stroke();
    g.fillStyle = "#00897B"; g.textAlign = "center"; g.fillText(t, x, y + 5); g.textAlign = "left";
  };
  const hy = (b: Box) => b.y + HEAD / 2;
  // Beneficiary → Service (1 — 0..n)
  { const x1 = ben.x + ben.w, x2 = svc.x, y = hy(ben); line([[x1, y], [x2, y]]); mark("one", x1, y, -1); mark("many", x2, y, 1); label("receives 0..n", (x1 + x2) / 2, y - 24); }
  // Beneficiary ↔ profile (1 — 1)
  { const x = ben.x + 70, y1 = ben.y + ben.h, y2 = prof.y; line([[x, y1], [x, y2]]); mark("one", x, y1, -1, true); mark("one", x, y2, 1, true); label("embeds profile", x + 100, (y1 + y2) / 2); }
  // Webhook → Service (0..n — 1)
  { const x = svc.x + svc.w / 2, y1 = svc.y + svc.h, y2 = hook.y; line([[x, y1], [x, y2]], true); mark("one", x, y1, -1, true); mark("zeroMany", x, y2, 1, true); label("notifies change", x + 110, (y1 + y2) / 2); }
  // Service → each component's data (1 — 0..1) via a bus running above the boxes
  if (dataBoxes.length) {
    const busY = TOPY - 40, sx = svc.x + svc.w, sy = hy(svc), g0 = sx + GAP_X / 2;
    const trunks = [...new Set(dataBoxes.map((b) => b.x))].map((x) => x - GAP_X / 2);
    line([[sx, sy], [g0, sy]]); mark("one", sx, sy, -1);
    line([[g0, sy], [g0, busY], [Math.max(...trunks), busY]]);
    for (const tx of trunks) {
      const col = dataBoxes.filter((b) => b.x - GAP_X / 2 === tx);
      line([[tx, busY], [tx, Math.max(...col.map(hy))]]);
      for (const b of col) { line([[tx, hy(b)], [b.x, hy(b)]]); mark("zeroOne", b.x, hy(b), 1); }
    }
    label(`data 0..1 · ${dataBoxes.length} component${dataBoxes.length > 1 ? "s" : ""}`, g0 + 120, busY);
  }

  for (const b of all) {
    const acc = ACC[b.e.accent];
    g.save(); g.shadowColor = "rgba(11,37,69,0.18)"; g.shadowBlur = 18; g.shadowOffsetY = 6;
    g.fillStyle = "#FFFFFF"; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 12); g.fill(); g.restore();
    g.strokeStyle = acc; g.lineWidth = 2; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 12); g.stroke();
    g.fillStyle = acc; g.beginPath(); g.roundRect(b.x, b.y, b.w, HEAD, [12, 12, 0, 0]); g.fill();
    g.fillStyle = b.e.accent === "gold" ? "#14213D" : "#FFFFFF"; g.font = F.title; g.fillText(b.e.title, b.x + 16, b.y + 30);
    g.font = F.tag; g.textAlign = "right"; g.fillText(tagOf(b.e.id), b.x + b.w - 14, b.y + 30); g.textAlign = "left";
    g.fillStyle = "#5B6770"; g.font = F.desc; b.desc.forEach((d, i) => g.fillText(d, b.x + 14, b.y + HEAD + 20 + i * 19));
    const top = b.y + HEAD + b.desc.length * 19 + 10;
    g.strokeStyle = "#D5DEE7"; g.lineWidth = 1; g.beginPath(); g.moveTo(b.x + 8, top); g.lineTo(b.x + b.w - 8, top); g.stroke();
    if (!b.e.props.length) { g.fillStyle = "#5B6770"; g.font = F.desc; g.fillText("No additional fields configured", b.x + 16, top + 20); }
    b.e.props.forEach((p, i) => {
      const ry = top + 4 + i * ROW;
      if (i % 2) { g.fillStyle = "#EEF3F8"; g.fillRect(b.x + 2, ry, b.w - 4, ROW); }
      const key = p.name === "id" ? "PK" : isFk(p.name) ? "FK" : p.name === "case_id" ? "UK" : "";
      if (key) { g.fillStyle = key === "PK" ? "#E0A100" : key === "FK" ? "#00897B" : "#0B2545"; g.beginPath(); g.roundRect(b.x + 10, ry + 7, 30, 17, 4); g.fill(); g.fillStyle = key === "PK" ? "#14213D" : "#FFFFFF"; g.font = "bold 11px Arial"; g.textAlign = "center"; g.fillText(key, b.x + 25, ry + 20); g.textAlign = "left"; }
      g.fillStyle = p.required ? acc : "#FFFFFF"; g.strokeStyle = acc; g.lineWidth = 1.5; g.beginPath(); g.arc(b.x + 52, ry + 15, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = p.required ? "#0B2545" : "#1F2933"; g.font = p.required ? F.name : F.nameN; g.fillText(p.name, b.x + 64, ry + 20);
      g.fillStyle = "#00897B"; g.font = F.type; g.textAlign = "right"; g.fillText(typeLabel(p), b.x + b.w - 14, ry + 20); g.textAlign = "left";
    });
  }
  g.fillStyle = "#5B6770"; g.font = "14px Arial"; g.fillText("Amehnities · Longitudinal Beneficiary Records · JSON Schema 2020-12 / OpenAPI 3.1", PAD, H - 24);

  // Page slices cut only where no box is crossed.
  const maxH = Math.round(W * pageAspect), pages: ErDiagram["pages"] = [];
  const safe = (y: number) => all.every((b) => y <= b.y - 8 || y >= b.y + b.h + 8);
  let start = 0;
  while (start < H) {
    let end = Math.min(H, start + maxH);
    if (end < H) { let y = end; while (y > start + maxH * 0.3 && !safe(y)) y -= 4; if (y > start + maxH * 0.3) end = y; }
    const pc = document.createElement("canvas"); pc.width = W; pc.height = end - start;
    pc.getContext("2d")!.drawImage(c, 0, start, W, end - start, 0, 0, W, end - start);
    pages.push({ data: pc.toDataURL("image/png"), w: W, h: end - start });
    start = end;
  }
  return { data: c.toDataURL("image/png"), w: W, h: H, pages };
}
