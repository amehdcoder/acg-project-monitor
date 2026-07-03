// Shared types for the Looker-style Dashboard Studio.

export type SourceKind = "form" | "table" | "google_sheet" | "csv_upload" | "rest_api";

export interface SourceField {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "boolean";
}

export interface DataSourceConfig {
  // form
  formId?: string;
  // table
  tableName?: string;
  // google_sheet
  url?: string;
  gid?: string;
  // csv_upload
  storagePath?: string;
  fileName?: string;
  // rest_api
  method?: string;
  headers?: Record<string, string>;
  jsonPath?: string;
  // cached rows for external/upload sources
  cachedRows?: Record<string, unknown>[];
  refreshedAt?: string;
}

export interface DashboardDataSource {
  id: string;
  name: string;
  source_kind: SourceKind;
  config: DataSourceConfig;
  schema: SourceField[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const SOURCE_KIND_META: Record<
  SourceKind,
  { label: string; description: string; gradient: string; icon: string }
> = {
  form: {
    label: "App Form",
    description: "Live submissions from a form in this app",
    gradient: "from-sky-500 to-blue-600",
    icon: "FileText",
  },
  table: {
    label: "App Table",
    description: "A database table in this app",
    gradient: "from-violet-500 to-purple-600",
    icon: "Database",
  },
  google_sheet: {
    label: "Google Sheets",
    description: "A shared Google Sheet (view access link)",
    gradient: "from-emerald-500 to-green-600",
    icon: "Sheet",
  },
  csv_upload: {
    label: "CSV / Excel Upload",
    description: "Upload a spreadsheet file as a data source",
    gradient: "from-amber-500 to-orange-600",
    icon: "Upload",
  },
  rest_api: {
    label: "REST / JSON API",
    description: "Rows from a public JSON endpoint",
    gradient: "from-rose-500 to-pink-600",
    icon: "Globe",
  },
};
