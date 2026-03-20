import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAdminSurveillance } from "@/hooks/useAdminSurveillance";
import { RESTRICTED_PAGES } from "@/hooks/usePageAccess";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Shield, Loader2 } from "lucide-react";

interface SuperAdminUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  grantedPages: string[];
  originalGrantedPages: string[];
}

const PageAccessManager = () => {
  const { user } = useAuth();
  const { logAction } = useAdminSurveillance();
  const [open, setOpen] = useState(false);
  const [admins, setAdmins] = useState<SuperAdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAdmins = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");

      if (!roles?.length) {
        setAdmins([]);
        setLoading(false);
        return;
      }

      const userIds = roles.map(r => r.user_id).filter(id => id !== user.id);

      if (!userIds.length) {
        setAdmins([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds);

      const { data: grants } = await supabase
        .from("admin_page_access")
        .select("user_id, page_id")
        .in("user_id", userIds);

      const grantMap: Record<string, string[]> = {};
      (grants || []).forEach((g) => {
        if (!grantMap[g.user_id]) grantMap[g.user_id] = [];
        grantMap[g.user_id].push(g.page_id);
      });

      setAdmins(
        (profiles || []).map(p => ({
          ...p,
          grantedPages: grantMap[p.user_id] || [],
          originalGrantedPages: [...(grantMap[p.user_id] || [])],
        }))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchAdmins();
  }, [open]);

  const togglePage = (adminIdx: number, pageId: string) => {
    setAdmins(prev => {
      const copy = [...prev];
      const admin = { ...copy[adminIdx] };
      if (admin.grantedPages.includes(pageId)) {
        admin.grantedPages = admin.grantedPages.filter(p => p !== pageId);
      } else {
        admin.grantedPages = [...admin.grantedPages, pageId];
      }
      copy[adminIdx] = admin;
      return copy;
    });
  };

  const toggleAll = (adminIdx: number) => {
    setAdmins(prev => {
      const copy = [...prev];
      const admin = { ...copy[adminIdx] };
      const allIds = RESTRICTED_PAGES.map(p => p.id);
      if (admin.grantedPages.length === allIds.length) {
        admin.grantedPages = [];
      } else {
        admin.grantedPages = [...allIds];
      }
      copy[adminIdx] = admin;
      return copy;
    });
  };

  const saveGrants = async () => {
    if (!user) return;
    setSaving(true);
    try {
      for (const admin of admins) {
        // Determine what changed
        const granted = admin.grantedPages.filter(p => !admin.originalGrantedPages.includes(p));
        const revoked = admin.originalGrantedPages.filter(p => !admin.grantedPages.includes(p));

        // Delete existing grants for this admin
        await supabase
          .from("admin_page_access")
          .delete()
          .eq("user_id", admin.user_id);

        // Insert new grants
        if (admin.grantedPages.length > 0) {
          await supabase.from("admin_page_access").insert(
            admin.grantedPages.map(pageId => ({
              user_id: admin.user_id,
              page_id: pageId,
              granted_by: user.id,
            }))
          );
        }

        // Audit log: granted pages
        for (const pageId of granted) {
          const pageLabel = RESTRICTED_PAGES.find(p => p.id === pageId)?.label || pageId;
          await logAction(
            "manage_dashboard",
            `Granted access to "${pageLabel}" page for ${admin.first_name} ${admin.last_name} (${admin.email})`,
            "admin_page_access",
            admin.user_id,
            { action: "grant", page_id: pageId, page_label: pageLabel, target_email: admin.email }
          );
        }

        // Audit log: revoked pages
        for (const pageId of revoked) {
          const pageLabel = RESTRICTED_PAGES.find(p => p.id === pageId)?.label || pageId;
          await logAction(
            "manage_dashboard",
            `Revoked access to "${pageLabel}" page for ${admin.first_name} ${admin.last_name} (${admin.email})`,
            "admin_page_access",
            admin.user_id,
            { action: "revoke", page_id: pageId, page_label: pageLabel, target_email: admin.email }
          );
        }
      }
      toast({ title: "Access updated", description: "Page access grants saved successfully." });
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to save access grants.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Shield className="h-4 w-4" />
          Manage Page Access
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Super Admin Page Access</DialogTitle>
          <DialogDescription>
            Grant or revoke access to restricted pages for other Super Admins.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No other Super Admins found. Promote a user to Super Admin first.
          </p>
        ) : (
          <div className="space-y-6">
            {admins.map((admin, idx) => (
              <div key={admin.user_id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">
                      {admin.first_name} {admin.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{admin.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAll(idx)}
                    className="text-xs"
                  >
                    {admin.grantedPages.length === RESTRICTED_PAGES.length
                      ? "Revoke All"
                      : "Grant All"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {RESTRICTED_PAGES.map(page => (
                    <label
                      key={page.id}
                      className="flex items-center gap-2 text-sm cursor-pointer rounded p-1.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={admin.grantedPages.includes(page.id)}
                        onCheckedChange={() => togglePage(idx, page.id)}
                      />
                      {page.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button onClick={saveGrants} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Access Grants
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PageAccessManager;
