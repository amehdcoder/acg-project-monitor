import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Share2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CustomDashboard, DashboardWidget } from "@/hooks/useDashboardBuilder";
import type { Json } from "@/integrations/supabase/types";

interface Form {
  id: string;
  name: string;
  project_id: string;
}

interface DashboardActionsProps {
  dashboard: CustomDashboard;
  widgets: DashboardWidget[];
  currentFormId: string;
  userId: string;
  onDuplicated?: () => void;
}

const DashboardActions = ({
  dashboard,
  widgets,
  currentFormId,
  userId,
  onDuplicated,
}: DashboardActionsProps) => {
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [newName, setNewName] = useState("");
  const [targetFormId, setTargetFormId] = useState(currentFormId);
  const [forms, setForms] = useState<Form[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);

  const loadForms = async () => {
    setLoadingForms(true);
    try {
      const { data, error } = await supabase
        .from("forms")
        .select("id, name, project_id")
        .order("name", { ascending: true });

      if (error) throw error;
      setForms(data || []);
    } catch (error) {
      console.error("Error loading forms:", error);
    } finally {
      setLoadingForms(false);
    }
  };

  const handleOpenDuplicate = () => {
    setNewName(`${dashboard.name} (Copy)`);
    setTargetFormId(currentFormId);
    loadForms();
    setShowDuplicateDialog(true);
  };

  const handleOpenShare = () => {
    setNewName(dashboard.name);
    loadForms();
    setShowShareDialog(true);
  };

  const duplicateDashboard = async () => {
    if (!newName.trim()) return;

    setDuplicating(true);
    try {
      // Create new dashboard
      const { data: newDashboard, error: dashError } = await supabase
        .from("custom_dashboards")
        .insert({
          form_id: targetFormId,
          name: newName.trim(),
          description: dashboard.description,
          created_by: userId,
          layout: dashboard.layout as Json,
          is_published: false,
        })
        .select()
        .single();

      if (dashError) throw dashError;

      // Duplicate widgets
      if (widgets.length > 0) {
        const widgetInserts = widgets.map((w) => ({
          dashboard_id: newDashboard.id,
          widget_type: w.widget_type,
          title: w.title,
          config: w.config as unknown as Json,
          position: w.position as unknown as Json,
        }));

        const { error: widgetError } = await supabase
          .from("dashboard_widgets")
          .insert(widgetInserts);

        if (widgetError) throw widgetError;
      }

      toast.success("Dashboard duplicated successfully");
      setShowDuplicateDialog(false);
      onDuplicated?.();
    } catch (error) {
      console.error("Error duplicating dashboard:", error);
      toast.error("Failed to duplicate dashboard");
    } finally {
      setDuplicating(false);
    }
  };

  const shareDashboard = async () => {
    if (!targetFormId || targetFormId === currentFormId) {
      toast.error("Please select a different form to share to");
      return;
    }

    setSharing(true);
    try {
      // Create new dashboard in target form
      const { data: newDashboard, error: dashError } = await supabase
        .from("custom_dashboards")
        .insert({
          form_id: targetFormId,
          name: newName.trim() || dashboard.name,
          description: dashboard.description,
          created_by: userId,
          layout: dashboard.layout as Json,
          is_published: false,
        })
        .select()
        .single();

      if (dashError) throw dashError;

      // Copy widgets with same structure
      if (widgets.length > 0) {
        const widgetInserts = widgets.map((w) => ({
          dashboard_id: newDashboard.id,
          widget_type: w.widget_type,
          title: w.title,
          config: w.config as unknown as Json,
          position: w.position as unknown as Json,
        }));

        const { error: widgetError } = await supabase
          .from("dashboard_widgets")
          .insert(widgetInserts);

        if (widgetError) throw widgetError;
      }

      toast.success("Dashboard shared successfully");
      setShowShareDialog(false);
    } catch (error) {
      console.error("Error sharing dashboard:", error);
      toast.error("Failed to share dashboard");
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpenDuplicate}>
        <Copy className="h-4 w-4 mr-2" />
        Duplicate
      </Button>
      <Button variant="outline" size="sm" onClick={handleOpenShare}>
        <Share2 className="h-4 w-4 mr-2" />
        Share to Form
      </Button>

      {/* Duplicate Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Dashboard Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Dashboard name"
              />
            </div>
            <div className="space-y-2">
              <Label>Target Form</Label>
              <Select value={targetFormId} onValueChange={setTargetFormId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select form" />
                </SelectTrigger>
                <SelectContent>
                  {loadingForms ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    forms.map((form) => (
                      <SelectItem key={form.id} value={form.id}>
                        {form.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select the same form to create a copy, or a different form to share the structure.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={duplicateDashboard} disabled={!newName.trim() || duplicating}>
              {duplicating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Dashboard to Another Form</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dashboard Name (optional rename)</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Dashboard name"
              />
            </div>
            <div className="space-y-2">
              <Label>Target Form</Label>
              <Select value={targetFormId} onValueChange={setTargetFormId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select form" />
                </SelectTrigger>
                <SelectContent>
                  {loadingForms ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    forms
                      .filter((f) => f.id !== currentFormId)
                      .map((form) => (
                        <SelectItem key={form.id} value={form.id}>
                          {form.name}
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The dashboard structure will be copied. You may need to reconfigure widgets that reference specific questions.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={shareDashboard}
              disabled={!targetFormId || targetFormId === currentFormId || sharing}
            >
              {sharing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardActions;
