/**
 * Raw Kobo Data — sub-tabbed explorer.
 *
 * • Supervisory checklist  — fixed XLSForm-ordered flattened/raw grids
 * • All responses          — schema-agnostic explorer over every Kobo field
 * • Medicine logistics     — the linked accountability form, split by cascade level
 * • Photos & signatures    — authenticated image gallery with lightbox
 */
import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, ClipboardList, Database, Pill } from "lucide-react";
import ChecklistDataTable from "./ChecklistDataTable";
import RawKoboDataTable from "./RawKoboDataTable";
import MedicineRawLevelTables from "./MedicineRawLevelTables";
import KoboMediaGallery from "./KoboMediaGallery";
import { getActiveConnectionId, loadKoboConfig, type KoboCache } from "./koboClient";
import { loadMedLogCache, loadMedLogConfig } from "./medicineKoboClient";

export default function RawKoboDataTabs({
  cache, onRefresh,
}: { cache: KoboCache | null; onRefresh?: () => void }) {
  const cfg = useMemo(() => loadKoboConfig(getActiveConnectionId()), [cache]);
  const medCache = useMemo(() => loadMedLogCache(), [cache]);
  const medCfg = useMemo(() => loadMedLogConfig(), [cache]);




  return (
    <Tabs defaultValue="checklist" className="space-y-3">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="checklist"><ClipboardList className="mr-1 h-4 w-4" /> Supervisory checklist</TabsTrigger>
        <TabsTrigger value="all"><Database className="mr-1 h-4 w-4" /> All responses</TabsTrigger>
        <TabsTrigger value="medicine"><Pill className="mr-1 h-4 w-4" /> Medicine logistics</TabsTrigger>
        <TabsTrigger value="media"><Camera className="mr-1 h-4 w-4" /> Photos &amp; signatures</TabsTrigger>
      </TabsList>

      <TabsContent value="checklist"><ChecklistDataTable cache={cache} /></TabsContent>

      <TabsContent value="all">
        <RawKoboDataTable
          cache={cache}
          cfg={cfg}
          onRefresh={onRefresh}
          title="Kobo Data Explorer"
          subtitle="Every question and every response from the linked KoboToolbox form"
        />
      </TabsContent>

      <TabsContent value="medicine" className="space-y-4">
        <MedicineRawLevelTables cache={medCache} />
        {medCache && (
          <RawKoboDataTable
            cache={medCache}
            cfg={medCfg}
            title="Medicine logistics — raw submissions"
            subtitle="Unmodified KoboToolbox payload for the medicine accountability form"
          />
        )}
      </TabsContent>

      <TabsContent value="media" className="space-y-6">
        <KoboMediaGallery cache={cache} cfg={cfg} title="Supervisory checklist — photos & signatures" />
        {medCache && (
          <KoboMediaGallery cache={medCache} cfg={medCfg} title="Medicine logistics — proof of delivery, signatures & receipts" />
        )}
      </TabsContent>

    </Tabs>
  );
}
