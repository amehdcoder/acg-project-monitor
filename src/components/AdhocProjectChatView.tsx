import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProjectChatDialog } from "@/components/ProjectChat";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquareText, Loader2, FolderOpen } from "lucide-react";

interface AssignedProject {
  id: string;
  name: string;
}

/**
 * Project Chat home for Adhoc users.
 *
 * Adhoc users are added to a project's chat groups automatically when an admin
 * assigns them to that project (DB trigger `sync_project_assignment_chat_membership`).
 * This view lists the project(s) they are assigned to and opens the full
 * project chat — including video/voice calls and every other chat feature.
 */
export default function AdhocProjectChatView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<AssignedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatProject, setChatProject] = useState<AssignedProject | null>(null);
  const [chatProjectForms, setChatProjectForms] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user.id);

        const projectIds = [...new Set((assignments || []).map((a) => a.project_id))];
        if (projectIds.length === 0) {
          if (!cancelled) setProjects([]);
          return;
        }

        const { data: projectRows } = await supabase
          .from("projects")
          .select("id, name")
          .in("id", projectIds);

        if (!cancelled) setProjects((projectRows || []) as AssignedProject[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Fetch the project's forms (used by the chat composer for form sharing).
  useEffect(() => {
    if (!chatProject) {
      setChatProjectForms([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("forms")
        .select("id, name")
        .eq("project_id", chatProject.id);
      if (!cancelled) setChatProjectForms((data || []) as Array<{ id: string; name: string }>);
    })();
    return () => {
      cancelled = true;
    };
  }, [chatProject]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-4">
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold text-foreground">Project Chat</h1>
        <p className="text-sm text-muted-foreground">
          Open the chat for your assigned project to message your team and start voice or video calls.
        </p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You have not been assigned to a project yet. Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <Card key={p.id} className="transition-colors hover:bg-accent/40">
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                    <MessageSquareText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Team chat, voice &amp; video calls</p>
                  </div>
                </div>
                <Button onClick={() => setChatProject(p)} className="shrink-0">
                  Open Chat
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {chatProject && (
        <ProjectChatDialog
          projectId={chatProject.id}
          projectName={chatProject.name}
          forms={chatProjectForms}
          open={!!chatProject}
          onOpenChange={(open) => {
            if (!open) setChatProject(null);
          }}
        />
      )}
    </div>
  );
}
