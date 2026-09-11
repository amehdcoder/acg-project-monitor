import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText, FolderOpen, Inbox, LogOut, RefreshCw, Send, Cloud, CloudOff, Briefcase, Loader2,
  ClipboardCheck, Search, ChevronRight, CircleCheck, Clock3, Smartphone,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useDeviceSession } from "@/hooks/useDeviceSession";
import { deviceUserId } from "@/lib/deviceSession";
import FormFiller from "@/components/FormFiller/FormFiller";
import SavedFormsManager from "@/components/FormFiller/SavedFormsManager";
import { listAllSavedEntries } from "@/lib/savedForms";
import { syncDeviceRecords } from "@/lib/deviceSync";
import SeeClearFormFiller from "@/components/SeeClear/SeeClearFormFiller";
import DeviceCaseFiller from "@/components/DeviceCollect/DeviceCaseFiller";

type SavedMode = "edit" | "send" | "view" | null;

/**
 * Device-mode workspace for collectors who joined by QR code.
 *
 * Everything on this screen comes from the cached project bundle, so it opens
 * and works with no network at all. Records are saved locally and queued until
 * a connection appears.
 */
const DeviceCollectShell = () => {
  const { session, leave, refresh } = useDeviceSession();
  const [fillingFormId, setFillingFormId] = useState<string | null>(null);
  const [savedMode, setSavedMode] = useState<SavedMode>(null);
  const [counts, setCounts] = useState({ draft: 0, finalized: 0, sent: 0 });
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [seeClearOpen, setSeeClearOpen] = useState(false);
  const [caseType, setCaseType] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("forms");
  const [search, setSearch] = useState("");

  const userId = session ? deviceUserId(session.deviceId) : "";

  const loadCounts = useCallback(async () => {
    if (!userId) return;
    const [draft, finalized, sent] = await Promise.all([
      listAllSavedEntries("draft"),
      listAllSavedEntries("finalized"),
      listAllSavedEntries("sent"),
    ]);
    const mine = (list: any[]) => list.filter((e) => e.userId === userId).length;
    setCounts({ draft: mine(draft), finalized: mine(finalized), sent: mine(sent) });
  }, [userId]);

  useEffect(() => { void loadCounts(); }, [loadCounts, fillingFormId, savedMode, seeClearOpen, caseType]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const forms = useMemo(() => {
    const list = session?.bundle?.forms ?? [];
    // Show every deployed checklist the project holds; only unfinished or
    // retired definitions are hidden.
    return list.filter((form: any) =>
      !["draft", "archived", "deleted", "inactive", "disabled"].includes(
        String(form.status ?? "active").toLowerCase(),
      ));
  }, [session]);

  const activeForm = useMemo(
    () => forms.find((f: any) => f.id === fillingFormId) ?? null,
    [forms, fillingFormId],
  );
  const visibleForms = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return forms;
    return forms.filter((form: any) => `${form.name ?? ""} ${form.description ?? ""}`.toLowerCase().includes(needle));
  }, [forms, search]);

  const doSync = async () => {
    if (!session) return;
    setSyncing(true);
    try {
      const result = await syncDeviceRecords();
      if (result.synced > 0) toast.success(`${result.synced} record(s) sent`);
      else if (result.failed > 0) toast.error("Some records could not be sent yet — they stay queued.");
      else toast.info("Nothing waiting to send");
      await refresh();
      await loadCounts();
    } catch {
      toast.error("Could not reach the server — records stay safely queued.");
    } finally {
      setSyncing(false);
    }
  };

  if (!session) return null;

  if (seeClearOpen) {
    return (
      <SeeClearFormFiller
        onClose={() => setSeeClearOpen(false)}
        deviceMode={{
          deviceId: session.deviceId,
          collectorLabel: session.label,
          projectId: session.projectId,
        }}
      />
    );
  }

  if (caseType) {
    return (
      <DeviceCaseFiller
        caseType={caseType}
        deviceId={session.deviceId}
        projectId={session.projectId}
        collectorLabel={session.label}
        onClose={() => setCaseType(null)}
        onSaved={() => void loadCounts()}
      />
    );
  }

  if (activeForm) {
    const questions = Array.isArray(activeForm.questions)
      ? activeForm.questions
      : (activeForm.questions?.questions ?? []);
    const groups = Array.isArray(activeForm.questions?.groups) ? activeForm.questions.groups : [];
    return (
      <FormFiller
        formId={activeForm.id}
        formName={activeForm.name}
        formDescription={activeForm.description ?? ""}
        questions={questions}
        groups={groups}
        geofence={activeForm.geofence ?? undefined}
        settings={activeForm.settings ?? undefined}
        userId={userId}
        projectId={session.projectId}
        localWorkflow
        onClose={() => setFillingFormId(null)}
        onSavedLocally={() => setFillingFormId(null)}
      />
    );
  }

  if (savedMode) {
    return (
      <SavedFormsManager
        mode={savedMode}
        userId={userId}
        projectId={session.projectId}
        onClose={() => setSavedMode(null)}
      />
    );
  }

  return (
    <div className="collector-shell safe-area-x min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-20 border-b border-primary/15 bg-primary text-primary-foreground shadow-soft">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="min-w-0">
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground/65">Field workspace</p>
            <h1 className="collector-title truncate text-lg font-bold">{session.projectName}</h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-primary-foreground/70"><Smartphone className="h-3 w-3" /> {session.label}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="gap-1 border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/10">
              {online ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
              {online ? "Online" : "Offline"}
            </Badge>
            <Button size="icon" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={() => void doSync()} disabled={syncing} aria-label="Send queued records">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={() => setConfirmLeave(true)} aria-label="Leave project">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="safe-area-bottom mx-auto max-w-3xl px-3 py-4 sm:px-4 sm:py-5">
        <section className="mb-5 grid grid-cols-3 gap-2" aria-label="Record summary">
          <div className="rounded-md border bg-card p-3 shadow-soft"><Clock3 className="mb-2 h-4 w-4 text-accent" /><p className="text-xl font-semibold">{counts.draft}</p><p className="text-[11px] text-muted-foreground">Drafts</p></div>
          <div className="rounded-md border bg-card p-3 shadow-soft"><Send className="mb-2 h-4 w-4 text-primary" /><p className="text-xl font-semibold">{counts.finalized}</p><p className="text-[11px] text-muted-foreground">Queued</p></div>
          <div className="rounded-md border bg-card p-3 shadow-soft"><CircleCheck className="mb-2 h-4 w-4 text-status-success" /><p className="text-xl font-semibold">{counts.sent}</p><p className="text-[11px] text-muted-foreground">Sent</p></div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full border bg-card p-1 shadow-soft">
            <TabsTrigger value="forms" className="flex-1">
              <FileText className="mr-1.5 h-4 w-4" /> Forms
            </TabsTrigger>
            <TabsTrigger value="records" className="flex-1">
              <Inbox className="mr-1.5 h-4 w-4" /> Records
              {counts.draft + counts.finalized > 0 && (
                <Badge variant="secondary" className="ml-1.5">{counts.draft + counts.finalized}</Badge>
              )}
            </TabsTrigger>
            {session.allowCases && (
              <TabsTrigger value="cases" className="flex-1">
                <Briefcase className="mr-1.5 h-4 w-4" /> Cases
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="forms" className="mt-5 space-y-3">
            <div className="mb-4">
              <h2 className="collector-title text-xl font-bold">Forms &amp; Checklists</h2>
              <p className="mt-1 text-xs text-muted-foreground">Available for this project, even without a connection.</p>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search forms and checklists" className="h-12 bg-card pl-10" aria-label="Search forms and checklists" />
            </div>
            {session.allowSeeclear && (
              <Card className="cursor-pointer border-primary/35 bg-card shadow-soft transition-colors hover:border-primary" onClick={() => setSeeClearOpen(true)}>
                <CardHeader className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10"><ClipboardCheck className="h-5 w-5 text-primary" /></div>
                    <div className="min-w-0 flex-1"><CardTitle className="collector-title text-base">See Clear Eye Health Facility Checklist</CardTitle><CardDescription className="mt-1">Facility visit checklist · Offline ready</CardDescription></div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
              </Card>
            )}
            {forms.length === 0 && !session.allowSeeclear && (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
                No forms have been published to this project yet.
              </CardContent></Card>
            )}
            {visibleForms.map((form: any, i: number) => (
              <motion.div key={form.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="cursor-pointer bg-card shadow-soft transition-colors hover:border-primary/60" onClick={() => setFillingFormId(form.id)}>
                  <CardHeader className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-secondary"><FolderOpen className="h-5 w-5 text-primary" /></div>
                      <div className="min-w-0 flex-1"><CardTitle className="collector-title text-base">{form.name}</CardTitle>{form.description && <CardDescription className="mt-1 line-clamp-2">{form.description}</CardDescription>}<p className="mt-1 text-[11px] font-medium text-primary">Offline ready</p></div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </TabsContent>

          <TabsContent value="records" className="mt-5 space-y-3">
            <div className="mb-4"><h2 className="collector-title text-xl font-bold">Recent Records</h2><p className="mt-1 text-xs text-muted-foreground">Continue drafts and manage records waiting to send.</p></div>
            <Card className="cursor-pointer hover:border-primary/50" onClick={() => setSavedMode("edit")}>
              <CardHeader className="py-4">
                <CardTitle className="text-base">Drafts <Badge variant="secondary" className="ml-2">{counts.draft}</Badge></CardTitle>
                <CardDescription>Unfinished records you can continue.</CardDescription>
              </CardHeader>
            </Card>
            <Card className="cursor-pointer hover:border-primary/50" onClick={() => setSavedMode("send")}>
              <CardHeader className="py-4">
                <CardTitle className="text-base">Ready to send <Badge variant="secondary" className="ml-2">{counts.finalized}</Badge></CardTitle>
                <CardDescription>Finalized records queued until a connection is available.</CardDescription>
              </CardHeader>
            </Card>
            <Card className="cursor-pointer hover:border-primary/50" onClick={() => setSavedMode("view")}>
              <CardHeader className="py-4">
                <CardTitle className="text-base">Sent <Badge variant="secondary" className="ml-2">{counts.sent}</Badge></CardTitle>
                <CardDescription>Records already delivered to the project.</CardDescription>
              </CardHeader>
            </Card>
            <Button size="lg" className="w-full" onClick={() => void doSync()} disabled={syncing || counts.finalized === 0}>
              <Send className="mr-2 h-4 w-4" /> Send {counts.finalized} queued record(s)
            </Button>
          </TabsContent>

          {session.allowCases && (
            <TabsContent value="cases" className="mt-5 space-y-3">
              <div className="mb-4"><h2 className="collector-title text-xl font-bold">Active Cases</h2><p className="mt-1 text-xs text-muted-foreground">Open and save project cases while offline.</p></div>
              {(session.bundle?.caseTypes ?? []).length === 0 && (
                <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No case types have been set up for this project yet.
                </CardContent></Card>
              )}
              {(session.bundle?.caseTypes ?? []).map((ct: any) => (
                <Card
                  key={ct.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setCaseType(ct)}
                >
                  <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-primary" /> {ct.label || ct.name}
                    </CardTitle>
                    <CardDescription>
                      {ct.description || "Open a new case — works offline."}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </TabsContent>
          )}
        </Tabs>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur" aria-label="Collector navigation">
        <div className="mx-auto grid h-16 max-w-3xl grid-cols-3 px-3">
          <Button variant="ghost" className={`h-full flex-col gap-1 rounded-none text-xs ${activeTab === "forms" ? "text-primary" : "text-muted-foreground"}`} onClick={() => setActiveTab("forms")}><FileText className="h-5 w-5" />Forms</Button>
          <Button variant="ghost" className={`h-full flex-col gap-1 rounded-none text-xs ${activeTab === "records" ? "text-primary" : "text-muted-foreground"}`} onClick={() => setActiveTab("records")}><Inbox className="h-5 w-5" />Records</Button>
          <Button variant="ghost" disabled={!session.allowCases} className={`h-full flex-col gap-1 rounded-none text-xs ${activeTab === "cases" ? "text-primary" : "text-muted-foreground"}`} onClick={() => setActiveTab("cases")}><Briefcase className="h-5 w-5" />Cases</Button>
        </div>
      </nav>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this project on this device?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need the project code again to come back. Records that have not been sent yet
              stay on this device and can still be sent after re-joining.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => leave()}>Leave project</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DeviceCollectShell;
