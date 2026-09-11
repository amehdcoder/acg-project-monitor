import { Question } from "@/components/FormBuilder/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MapPin, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { getCommunities, getCommunitiesByWard } from "@/lib/grid3NigeriaData";
import { GEO_FIELDS } from "@/lib/programmeModule/registrationChoices";

export type AnswerMap = Record<string, unknown>;

/**
 * Evaluates a simple XLSForm-style relevance expression, e.g.
 * `${disability} = 'Yes'` or `${age} > 5`. Unsupported expressions show the
 * question rather than hiding data.
 */
export const isRelevant = (expr: string | undefined, answers: AnswerMap): boolean => {
  if (!expr || !expr.trim()) return true;
  const m = expr.match(/\$\{([\w.-]+)\}\s*(=|!=|>|<|>=|<=)\s*'?([^']*)'?/);
  if (!m) return true;
  const [, name, op, raw] = m;
  const actual = answers[name];
  const a = actual == null ? "" : String(actual).trim().toLowerCase();
  const b = String(raw).trim().toLowerCase();
  const na = parseFloat(a);
  const nb = parseFloat(b);
  switch (op) {
    case "=": return a === b;
    case "!=": return a !== b;
    case ">": return !isNaN(na) && !isNaN(nb) && na > nb;
    case "<": return !isNaN(na) && !isNaN(nb) && na < nb;
    case ">=": return !isNaN(na) && !isNaN(nb) && na >= nb;
    case "<=": return !isNaN(na) && !isNaN(nb) && na <= nb;
    default: return true;
  }
};

/** Applies `calculate` questions of the form `${a} + ${b}` / plain numbers. */
export const applyCalculations = (questions: Question[], answers: AnswerMap): AnswerMap => {
  const next = { ...answers };
  for (const q of questions) {
    if (q.type !== "calculate" || !q.calculation || !q.name) continue;
    const expr = q.calculation.replace(/\$\{([\w.-]+)\}/g, (_, n) => {
      const v = parseFloat(String(next[n] ?? 0));
      return String(Number.isNaN(v) ? 0 : v);
    });
    if (/^[\d\s+\-*/.()]+$/.test(expr)) {
      try {
        // eslint-disable-next-line no-new-func
        next[q.name] = new Function(`return (${expr});`)();
      } catch { /* leave unchanged */ }
    }
  }
  return next;
};

export const validateQuestion = (q: Question, value: unknown): string | null => {
  const empty = value === undefined || value === null || String(value).trim() === "";
  if (q.required && empty) return `${q.label} is required`;
  if (empty) return null;
  const v = q.validation || {};
  const str = String(value);
  if (q.type === "number") {
    const n = parseFloat(str);
    if (Number.isNaN(n)) return `${q.label} must be a number`;
    if (v.min != null && n < v.min) return v.message || `${q.label} must be at least ${v.min}`;
    if (v.max != null && n > v.max) return v.message || `${q.label} must be at most ${v.max}`;
  }
  if (v.minLength != null && str.length < v.minLength) return v.message || `${q.label} is too short`;
  if (v.maxLength != null && str.length > v.maxLength) return v.message || `${q.label} is too long`;
  if (v.regex) {
    try {
      if (!new RegExp(v.regex).test(str)) return v.message || `${q.label} is not in the expected format`;
    } catch { /* ignore bad regex */ }
  }
  return null;
};

interface Props {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string | null;
  /** All answers on the form — enables cascading State → LGA → Ward → Community. */
  answers?: AnswerMap;
  /** Sets another field, e.g. clearing LGA and Ward when the State changes. */
  onPatch?: (values: Record<string, unknown>) => void;
}

const ConfigFieldRenderer = ({ question, value, onChange, error, answers, onPatch }: Props) => {
  const [locating, setLocating] = useState(false);
  const id = `q-${question.id}`;
  const multiline = question.appearance?.includes("multiline");
  const listId = `${id}-list`;

  // Cascading administrative geography, backed by the official INEC / GRID3
  // registry bundled with the app so it also works with no network.
  const geoName = GEO_FIELDS.includes(question.name || "") ? question.name : null;
  const stateValue = String(answers?.state ?? "");
  const lgaValue = String(answers?.lga ?? "");
  const wardValue = String(answers?.ward ?? "");

  const geoChoices = useMemo(() => {
    if (!geoName) return [] as string[];
    try {
      if (geoName === "state") return getAllStates();
      if (geoName === "lga") return stateValue ? getLGAsForState(stateValue) : [];
      if (geoName === "ward") return stateValue && lgaValue ? getWardsForLGA(stateValue, lgaValue) : [];
      if (!stateValue || !lgaValue) return [];
      const byWard = wardValue ? getCommunitiesByWard(stateValue, lgaValue, wardValue) : [];
      return byWard.length ? byWard : getCommunities(stateValue, lgaValue);
    } catch {
      return [];
    }
  }, [geoName, stateValue, lgaValue, wardValue]);

  const geoControl = () => {
    // Village / community: autocomplete against the registry but still typable,
    // because new settlements are found in the field.
    if (geoName === "village") {
      return (
        <>
          <Input id={id} list={listId} value={String(value ?? "")} placeholder="Start typing the community name…"
            onChange={(e) => onChange(e.target.value)} />
          <datalist id={listId}>
            {geoChoices.slice(0, 500).map((c) => <option key={c} value={c} />)}
          </datalist>
        </>
      );
    }
    const disabled = geoChoices.length === 0;
    const clears: Record<string, unknown> =
      geoName === "state" ? { lga: "", ward: "", village: "" }
        : geoName === "lga" ? { ward: "", village: "" }
          : { village: "" };
    return (
      <Select
        value={String(value ?? "")}
        onValueChange={(v) => { onChange(v); onPatch?.(clears); }}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={disabled ? "Select the level above first" : "Select…"} />
        </SelectTrigger>
        <SelectContent className="z-[1200] max-h-72 bg-popover">
          {geoChoices.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  };

  const captureGps = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const control = () => {
    if (geoName && answers && (question.type === "text" || question.type === "select_one")) {
      return geoControl();
    }
    switch (question.type) {
      case "note":
        return <p className="text-sm text-muted-foreground">{question.hint}</p>;
      case "number":
      case "range":
        return (
          <Input id={id} type="number" inputMode="decimal" value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)} />
        );
      case "date":
        return <Input id={id} type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
      case "datetime":
        return <Input id={id} type="datetime-local" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
      case "time":
        return <Input id={id} type="time" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
      case "select_one":
        return (
          <Select value={String(value ?? "")} onValueChange={onChange}>
            <SelectTrigger id={id}><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              {(question.options || []).map((o) => (
                <SelectItem key={o.id} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "select_multiple": {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            {(question.options || []).map((o) => (
              <label key={o.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <Checkbox
                  checked={selected.includes(o.value)}
                  onCheckedChange={(c) =>
                    onChange(c ? [...selected, o.value] : selected.filter((s) => s !== o.value))
                  }
                />
                {o.label}
              </label>
            ))}
          </div>
        );
      }
      case "geopoint":
        return (
          <div className="flex gap-2">
            <Input id={id} value={String(value ?? "")} placeholder="lat, lng"
              onChange={(e) => onChange(e.target.value)} />
            <Button type="button" variant="outline" onClick={captureGps} disabled={locating}>
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            </Button>
          </div>
        );
      case "image":
      case "file":
      case "signature":
        return (
          <Input id={id} type="file" accept={question.type === "image" ? "image/*" : undefined}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => onChange(reader.result);
              reader.readAsDataURL(file);
            }} />
        );
      case "calculate":
        return <Input id={id} value={String(value ?? "")} readOnly className="bg-muted" />;
      default:
        return multiline
          ? <Textarea id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} rows={3} />
          : <Input id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {question.label}
        {question.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {control()}
      {question.hint && question.type !== "note" && (
        <p className="text-xs text-muted-foreground">{question.hint}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

export default ConfigFieldRenderer;
