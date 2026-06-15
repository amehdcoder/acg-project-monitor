import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette, Sun, Moon, LayoutGrid, RotateCcw, Eye } from "lucide-react";
import {
  FormTheme,
  FormThemeColors,
  DEFAULT_FORM_THEME,
  FONT_CHOICES,
  buildFormThemeStyle,
} from "@/lib/formTheme";

interface ThemeEditorProps {
  theme: FormTheme;
  onChange: (theme: FormTheme) => void;
}

const COLOR_FIELDS: { key: keyof FormThemeColors; label: string }[] = [
  { key: "background", label: "Page background" },
  { key: "foreground", label: "Text" },
  { key: "card", label: "Field / card surface" },
  { key: "primary", label: "Primary (buttons)" },
  { key: "accent", label: "Accent" },
  { key: "headerBg", label: "Header background" },
  { key: "headerText", label: "Header text" },
  { key: "border", label: "Borders" },
];

const PRESETS: { name: string; light: Partial<FormThemeColors>; dark: Partial<FormThemeColors> }[] = [
  {
    name: "Ocean",
    light: { primary: "#2563eb", accent: "#0ea5e9", headerBg: "#0c2340", headerText: "#ffffff" },
    dark: { primary: "#3b82f6", accent: "#38bdf8", headerBg: "#0c1a33", headerText: "#f8fafc" },
  },
  {
    name: "Emerald",
    light: { primary: "#059669", accent: "#10b981", headerBg: "#064e3b", headerText: "#ffffff" },
    dark: { primary: "#10b981", accent: "#34d399", headerBg: "#052e23", headerText: "#ecfdf5" },
  },
  {
    name: "Violet",
    light: { primary: "#7c3aed", accent: "#a855f7", headerBg: "#3b0764", headerText: "#ffffff" },
    dark: { primary: "#a855f7", accent: "#c084fc", headerBg: "#2e1065", headerText: "#faf5ff" },
  },
  {
    name: "Rose",
    light: { primary: "#be185d", accent: "#ec4899", headerBg: "#831843", headerText: "#ffffff" },
    dark: { primary: "#ec4899", accent: "#f472b6", headerBg: "#500724", headerText: "#fff1f2" },
  },
  {
    name: "Amber",
    light: { primary: "#d97706", accent: "#f59e0b", headerBg: "#78350f", headerText: "#ffffff" },
    dark: { primary: "#f59e0b", accent: "#fbbf24", headerBg: "#451a03", headerText: "#fffbeb" },
  },
];

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-24 font-mono text-xs"
        />
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
          aria-label={`${label} colour picker`}
        />
      </div>
    </div>
  );
}

function ThemePreview({ theme, isDark }: { theme: FormTheme; isDark: boolean }) {
  const style = useMemo(() => buildFormThemeStyle({ ...theme, enabled: true }, isDark), [theme, isDark]);
  return (
    <div
      className="overflow-hidden rounded-xl border border-border shadow-sm"
      style={style}
    >
      <div
        className="px-4 py-3"
        style={{
          backgroundColor: `hsl(var(--form-header-bg))`,
          color: `hsl(var(--form-header-text))`,
        }}
      >
        <p className="text-sm font-semibold">Sample Form Header</p>
        <p className="text-xs opacity-80">{isDark ? "Dark mode" : "Light mode"} preview</p>
      </div>
      <div
        className="space-y-[var(--form-field-gap)] p-4"
        style={{ backgroundColor: `hsl(var(--background))`, color: `hsl(var(--foreground))` }}
      >
        <div
          className={
            theme.cardStyle === "elevated"
              ? "shadow-md"
              : theme.cardStyle === "bordered"
                ? "border border-[hsl(var(--border))]"
                : ""
          }
          style={{
            backgroundColor: `hsl(var(--card))`,
            borderRadius: `var(--radius)`,
            padding: "0.75rem",
          }}
        >
          <p className="mb-1 text-xs font-medium">Question label</p>
          <div
            className="h-8 w-full rounded-md border"
            style={{ borderColor: `hsl(var(--border))`, backgroundColor: `hsl(var(--background))` }}
          />
        </div>
        <button
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{
            backgroundColor: `hsl(var(--primary))`,
            color: `hsl(var(--primary-foreground))`,
            borderRadius: `var(--radius)`,
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}

const ThemeEditor = ({ theme, onChange }: ThemeEditorProps) => {
  const update = (patch: Partial<FormTheme>) => onChange({ ...theme, ...patch });
  const updateColor = (mode: "light" | "dark", key: keyof FormThemeColors, value: string) =>
    onChange({ ...theme, [mode]: { ...theme[mode], [key]: value } });

  const applyPreset = (preset: (typeof PRESETS)[number]) =>
    onChange({
      ...theme,
      enabled: true,
      light: { ...theme.light, ...preset.light },
      dark: { ...theme.dark, ...preset.dark },
    });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header / enable */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Palette className="h-5 w-5 text-primary" />
            Theme & Appearance
          </CardTitle>
          <CardDescription>
            Edit layout, colours and dark-mode styling for this form from one place. Reorder fields by
            dragging them on the Questions tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="theme-enabled">Use custom theme</Label>
              <p className="text-xs text-muted-foreground">
                When off, the form uses the app's default appearance.
              </p>
            </div>
            <Switch
              id="theme-enabled"
              checked={theme.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
            />
          </div>

          {/* Presets */}
          <div className="space-y-2">
            <Label className="text-sm">Quick palettes</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.name} variant="outline" size="sm" onClick={() => applyPreset(p)}>
                  <span
                    className="mr-2 h-3 w-3 rounded-full"
                    style={{ backgroundColor: p.light.primary }}
                  />
                  {p.name}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ ...DEFAULT_FORM_THEME, enabled: theme.enabled })}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Layout */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Layout
          </CardTitle>
          <CardDescription>Control density, columns, card style and corners.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Field spacing</Label>
            <Select value={theme.density} onValueChange={(v: any) => update({ density: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="spacious">Spacious</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Columns (wide screens)</Label>
            <Select value={String(theme.columns)} onValueChange={(v) => update({ columns: v === "2" ? 2 : 1 })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Single column</SelectItem>
                <SelectItem value="2">Two columns</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Card style</Label>
            <Select value={theme.cardStyle} onValueChange={(v: any) => update({ cardStyle: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">Flat</SelectItem>
                <SelectItem value="bordered">Bordered</SelectItem>
                <SelectItem value="elevated">Elevated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Corner radius</Label>
            <Select value={theme.radius} onValueChange={(v) => update({ radius: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0rem">Square</SelectItem>
                <SelectItem value="0.375rem">Small</SelectItem>
                <SelectItem value="0.75rem">Medium</SelectItem>
                <SelectItem value="1rem">Large</SelectItem>
                <SelectItem value="1.5rem">Extra large</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Font</Label>
            <Select value={theme.font} onValueChange={(v) => update({ font: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_CHOICES.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Colours + live preview */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Sun className="h-5 w-5 text-amber-500" />
              Light mode colours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {COLOR_FIELDS.map((f) => (
              <ColorRow
                key={f.key}
                label={f.label}
                value={theme.light[f.key]}
                onChange={(v) => updateColor("light", f.key, v)}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Moon className="h-5 w-5 text-indigo-400" />
              Dark mode colours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {COLOR_FIELDS.map((f) => (
              <ColorRow
                key={f.key}
                label={f.label}
                value={theme.dark[f.key]}
                onChange={(v) => updateColor("dark", f.key, v)}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Live preview */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Eye className="h-5 w-5 text-primary" />
            Live preview
            <Badge variant="secondary" className="ml-2 text-xs">Light & Dark</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ThemePreview theme={theme} isDark={false} />
          <ThemePreview theme={theme} isDark={true} />
        </CardContent>
      </Card>
    </div>
  );
};

export default ThemeEditor;
