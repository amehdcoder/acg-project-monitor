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
  ClipboardCheck,
} from "lucide-react";
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

  useEffect(() => { void loadCounts(); }, [loadCounts, fillingFormId, savedMode, seeClearOpen]);

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
    return list.filter((f: any) => (f.status ? f.status !== "archived" : true));
  }, [session]);

  const activeForm = useMemo(
    () => forms.find((f: any) => f.id === fillingFormId) ?? null,
    [forms, fillingFormId],
  );

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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">Collecting for</p>
            <h1 className="font-display text-lg font-semibold truncate">{session.projectName}</h1>
            <p className="text-xs text-muted-foreground truncate">{session.label}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={online ? "secondary" : "outline"} className="gap-1">
              {online ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
              {online ? "Online" : "Offline"}
            </Badge>
            <Button size="icon" variant="ghost" onClick={() => void doSync()} disabled={syncing} aria-label="Send queued records">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setConfirmLeave(true)} aria-label="Leave project">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        <Tabs defaultValue="forms">
          <TabsList className="w-full">
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

          <TabsContent value="forms" className="mt-4 space-y-3">
            {session.allowSeeclear && (
              <Card className="cursor-pointer border-primary/40 hover:border-primary transition-colors" onClick={() => setSeeClearOpen(true)}>
                <CardHeader className="py-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-primary" /> See Clear Eye Health Facility Checklist
                  </CardTitle>
                  <CardDescription>Full facility visit checklist — works completely offline.</CardDescription>
                </CardHeader>
              </Card>
            )}
            {forms.length === 0 && !session.allowSeeclear && (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
                No forms have been published to this project yet.
              </CardContent></Card>
            )}
            {forms.map((form: any, i: number) => (
              <motion.div key={form.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFillingFormId(form.id)}>
                  <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-primary" /> {form.name}
                    </CardTitle>
                    {form.description && <CardDescription className="line-clamp-2">{form.description}</CardDescription>}
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </TabsContent>

          <TabsContent value="records" className="mt-4 space-y-3">
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
            <Button className="w-full" onClick={() => void doSync()} disabled={syncing || counts.finalized === 0}>
              <Send className="mr-2 h-4 w-4" /> Send {counts.finalized} queued record(s)
            </Button>
          </TabsContent>

          {session.allowCases && (
            <TabsContent value="cases" className="mt-4 space-y-3">
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
