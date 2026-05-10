import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface WidgetConfig {
  questionId?: string;
  aggregation?: "count" | "sum" | "avg" | "min" | "max";
  groupBy?: string;
  filters?: Record<string, unknown>;
  colors?: string[];
  showLegend?: boolean;
  showLabels?: boolean;
  textContent?: string;
  kpiLabel?: string;
  kpiValue?: string;
}

export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  widget_type: "bar" | "line" | "pie" | "area" | "radar" | "table" | "kpi" | "text" | "map";
  title: string;
  config: WidgetConfig;
  position: { x: number; y: number; w: number; h: number };
  created_at: string;
  updated_at: string;
}

export interface CustomDashboard {
  id: string;
  form_id: string;
  name: string;
  description: string | null;
  layout: unknown[];
  created_by: string;
  created_at: string;
  updated_at: string;
  is_published: boolean;
}

export interface FormQuestion {
  id: string;
  label: string;
  type: string;
  options?: { label: string; value: string }[];
}

export const useDashboardBuilder = (formId?: string) => {
  const { user } = useAuth();
  const [dashboards, setDashboards] = useState<CustomDashboard[]>([]);
  const [currentDashboard, setCurrentDashboard] = useState<CustomDashboard | null>(null);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchDashboards = useCallback(async () => {
    if (!formId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("custom_dashboards")
        .select("*")
        .eq("form_id", formId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDashboards((data as CustomDashboard[]) || []);
    } catch (error) {
      console.error("Error fetching dashboards:", error);
      toast.error("Failed to load dashboards");
    } finally {
      setLoading(false);
    }
  }, [formId]);

  const fetchWidgets = useCallback(async (dashboardId: string) => {
    try {
      const { data, error } = await supabase
        .from("dashboard_widgets")
        .select("*")
        .eq("dashboard_id", dashboardId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      const parsedWidgets = (data || []).map((w) => ({
        ...w,
        config: typeof w.config === 'string' ? JSON.parse(w.config) : w.config,
        position: typeof w.position === 'string' ? JSON.parse(w.position) : w.position,
      }));
      
      setWidgets(parsedWidgets as DashboardWidget[]);
    } catch (error) {
      console.error("Error fetching widgets:", error);
      toast.error("Failed to load widgets");
    }
  }, []);

  const createDashboard = async (name: string, description?: string) => {
    if (!formId || !user) return null;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("custom_dashboards")
        .insert([{
          form_id: formId,
          name,
          description: description || null,
          created_by: user.id,
          layout: [] as Json,
        }])
        .select()
        .single();

      if (error) throw error;
      
      toast.success("Dashboard created successfully");
      await fetchDashboards();
      return data as CustomDashboard;
    } catch (error) {
      console.error("Error creating dashboard:", error);
      toast.error("Failed to create dashboard");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updateDashboard = async (dashboardId: string, updates: Partial<CustomDashboard>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("custom_dashboards")
        .update(updates as any)
        .eq("id", dashboardId);

      if (error) throw error;
      
      toast.success("Dashboard updated successfully");
      await fetchDashboards();
      
      if (currentDashboard?.id === dashboardId) {
        setCurrentDashboard(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (error) {
      console.error("Error updating dashboard:", error);
      toast.error("Failed to update dashboard");
    } finally {
      setSaving(false);
    }
  };

  const deleteDashboard = async (dashboardId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("custom_dashboards")
        .delete()
        .eq("id", dashboardId);

      if (error) throw error;
      
      toast.success("Dashboard deleted successfully");
      await fetchDashboards();
      
      if (currentDashboard?.id === dashboardId) {
        setCurrentDashboard(null);
        setWidgets([]);
      }
    } catch (error) {
      console.error("Error deleting dashboard:", error);
      toast.error("Failed to delete dashboard");
    } finally {
      setSaving(false);
    }
  };

  const addWidget = async (
    dashboardId: string,
    widgetType: DashboardWidget["widget_type"],
    title: string,
    config: WidgetConfig,
    position?: DashboardWidget["position"]
  ) => {
    setSaving(true);
    try {
      const defaultPosition = position || { x: 0, y: widgets.length * 4, w: 6, h: 4 };
      
      const { data, error } = await supabase
        .from("dashboard_widgets")
        .insert([{
          dashboard_id: dashboardId,
          widget_type: widgetType,
          title,
          config: config as unknown as Json,
          position: defaultPosition as unknown as Json,
        }])
        .select()
        .single();

      if (error) throw error;
      
      const newWidget = {
        ...data,
        config: typeof data.config === 'string' ? JSON.parse(data.config) : data.config,
        position: typeof data.position === 'string' ? JSON.parse(data.position) : data.position,
      } as DashboardWidget;
      
      setWidgets(prev => [...prev, newWidget]);
      toast.success("Widget added successfully");
      return newWidget;
    } catch (error) {
      console.error("Error adding widget:", error);
      toast.error("Failed to add widget");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updateWidget = async (widgetId: string, updates: Partial<DashboardWidget>) => {
    setSaving(true);
    try {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.widget_type) dbUpdates.widget_type = updates.widget_type;
      if (updates.title) dbUpdates.title = updates.title;
      if (updates.config) dbUpdates.config = updates.config as unknown as Json;
      if (updates.position) dbUpdates.position = updates.position as unknown as Json;
      
      const { error } = await supabase
        .from("dashboard_widgets")
        .update(dbUpdates as any)
        .eq("id", widgetId);

      if (error) throw error;
      
      setWidgets(prev => prev.map(w => 
        w.id === widgetId ? { ...w, ...updates } : w
      ));
      toast.success("Widget updated");
    } catch (error) {
      console.error("Error updating widget:", error);
      toast.error("Failed to update widget");
    } finally {
      setSaving(false);
    }
  };

  const deleteWidget = async (widgetId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("dashboard_widgets")
        .delete()
        .eq("id", widgetId);

      if (error) throw error;
      
      setWidgets(prev => prev.filter(w => w.id !== widgetId));
      toast.success("Widget deleted");
    } catch (error) {
      console.error("Error deleting widget:", error);
      toast.error("Failed to delete widget");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (dashboardId: string, isPublished: boolean) => {
    await updateDashboard(dashboardId, { is_published: isPublished });
  };

  const selectDashboard = useCallback(async (dashboard: CustomDashboard | null) => {
    setCurrentDashboard(dashboard);
    if (dashboard) {
      await fetchWidgets(dashboard.id);
    } else {
      setWidgets([]);
    }
  }, [fetchWidgets]);

  useEffect(() => {
    if (formId) {
      fetchDashboards();
    }
  }, [formId, fetchDashboards]);

  return {
    dashboards,
    currentDashboard,
    widgets,
    loading,
    saving,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    addWidget,
    updateWidget,
    deleteWidget,
    togglePublish,
    selectDashboard,
    fetchDashboards,
  };
};
