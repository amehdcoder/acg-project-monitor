// Special Form Studio — full-fidelity template export / import.
//
// A template package is a portable JSON copy of a special form AND its linked
// dashboard structure, so Owners can duplicate and share customized templates.
// On import, element `id`s are regenerated to avoid collisions while question
// `name`s (which the dashboard config references) are preserved.

import type { FormGroup } from "@/components/FormBuilder/types";
import type { FormTheme } from "@/lib/formTheme";
import { normalizeFormTheme } from "@/lib/formTheme";
import type { DashboardConfig } from "./presets";

const PACKAGE_KIND = "amehnities.special-form-template";
const PACKAGE_VERSION = 1;

export interface TemplatePackage {
  kind: typeof PACKAGE_KIND;
  packageVersion: number;
  exportedAt: string;
  name: string;
  description: string | null;
  sections: FormGroup[];
  theme: FormTheme;
  dashboardEnabled: boolean;
  dashboardConfig: DashboardConfig | null;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function reIdSections(sections: FormGroup[]): FormGroup[] {
  return (sections || []).map((s) => ({
    ...s,
    id: uid(),
    questions: (s.questions || []).map((q) => ({
      ...q,
      id: uid(),
      options: q.options?.map((o) => ({ ...o, id: uid() })),
    })),
  }));
}

export function buildTemplatePackage(input: {
  name: string;
  description: string | null;
  sections: FormGroup[];
  theme: FormTheme;
  dashboardEnabled: boolean;
  dashboardConfig: DashboardConfig | null;
}): TemplatePackage {
  return {
    kind: PACKAGE_KIND,
    packageVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    name: input.name,
    description: input.description ?? null,
    sections: input.sections,
    theme: input.theme,
    dashboardEnabled: input.dashboardEnabled,
    dashboardConfig: input.dashboardConfig,
  };
}

export function downloadTemplatePackage(pkg: TemplatePackage) {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (pkg.name || "special-form").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  a.href = url;
  a.download = `${safe || "special-form"}.amtemplate.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ImportedTemplate {
  name: string;
  description: string | null;
  sections: FormGroup[];
  theme: FormTheme;
  dashboardEnabled: boolean;
  dashboardConfig: DashboardConfig | null;
}

export async function importTemplatePackage(file: File): Promise<ImportedTemplate> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not a valid template (invalid JSON).");
  }
  const pkg = parsed as Partial<TemplatePackage>;
  if (pkg?.kind !== PACKAGE_KIND || !Array.isArray(pkg.sections)) {
    throw new Error("Unrecognized template file. Expected an Amehnities special-form template.");
  }
  const sections = reIdSections(pkg.sections as FormGroup[]);
  return {
    name: `${pkg.name || "Imported template"} (copy)`,
    description: pkg.description ?? null,
    sections: sections.length ? sections : [{ id: uid(), name: `sec_${uid()}`, label: "Section 1", questions: [] }],
    theme: normalizeFormTheme(pkg.theme),
    dashboardEnabled: !!pkg.dashboardEnabled,
    dashboardConfig: (pkg.dashboardConfig as DashboardConfig | null) ?? null,
  };
}
