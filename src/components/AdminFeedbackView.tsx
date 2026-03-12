import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  MessageSquare, Search, Star, Clock, CheckCircle, AlertTriangle,
  Send, Filter, RefreshCw, User, Calendar, ChevronDown, ChevronUp, Bell
} from "lucide-react";
import { format } from "date-fns";

interface FeedbackItem {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  message: string;
  rating: number | null;
  status: string;
  admin_response: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: "Open", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: AlertTriangle },
  resolved: { label: "Resolved", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle },
  closed: { label: "Closed", color: "bg-muted text-muted-foreground border-border", icon: CheckCircle },
};

const categoryLabels: Record<string, string> = {
  bug: "Bug Report", feature: "Feature Request", general: "General",
  data: "Data Issue", performance: "Performance", ui: "UI/UX", other: "Other",
};

const AdminFeedbackView = () => {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [responding, setResponding] = useState(false);

  const fetchFeedback = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading feedback", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const userIds = [...new Set((data || []).map(f => f.user_id))];
    let profileMap: Record<string, { name: string; email: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds);
      (profiles || []).forEach(p => {
        profileMap[p.user_id] = { name: `${p.first_name} ${p.last_name}`.trim(), email: p.email };
      });
    }

    setFeedback((data || []).map(f => ({
      ...f,
      user_name: profileMap[f.user_id]?.name || "Unknown",
      user_email: profileMap[f.user_id]?.email || "",
    })));
    setLoading(false);
  };

  useEffect(() => { fetchFeedback(); }, []);

  const handleRespond = async (id: string) => {
    if (!responseText.trim()) return;
    setResponding(true);

    const item = feedback.find(f => f.id === id);

    const { error } = await supabase
      .from("feedback")
      .update({ admin_response: responseText, status: "resolved", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Send in-app notification to the user
      if (item) {
        await supabase.from("notifications").insert({
          user_id: item.user_id,
          title: "📬 Feedback Response",
          message: `Your feedback "${item.subject}" has been reviewed and responded to by an admin.`,
          type: "info",
          category: "feedback",
        });
      }
      toast({ title: "Response sent", description: "Feedback resolved and user has been notified." });
      setResponseText("");
      setExpandedId(null);
      fetchFeedback();
    }
    setResponding(false);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const item = feedback.find(f => f.id === id);
    const { error } = await supabase
      .from("feedback")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      // Notify user of status change
      if (item && newStatus !== item.status) {
        await supabase.from("notifications").insert({
          user_id: item.user_id,
          title: "📋 Feedback Status Updated",
          message: `Your feedback "${item.subject}" status changed to ${newStatus}.`,
          type: "info",
          category: "feedback",
        });
      }
      fetchFeedback();
    }
  };

  const filtered = feedback.filter(f => {
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (filterCategory !== "all" && f.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return f.subject.toLowerCase().includes(q) || f.message.toLowerCase().includes(q) ||
        (f.user_name || "").toLowerCase().includes(q) || (f.user_email || "").toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: feedback.length,
    open: feedback.filter(f => f.status === "open").length,
    inProgress: feedback.filter(f => f.status === "in_progress").length,
    resolved: feedback.filter(f => f.status === "resolved" || f.status === "closed").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Feedback Management</h1>
          <p className="text-sm text-muted-foreground">Review and respond to user feedback submissions</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchFeedback} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total, icon: MessageSquare, color: "text-foreground" },
          { label: "Open", value: stats.open, icon: Clock, color: "text-amber-600" },
          { label: "In Progress", value: stats.inProgress, icon: AlertTriangle, color: "text-blue-600" },
          { label: "Resolved", value: stats.resolved, icon: CheckCircle, color: "text-green-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search feedback..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(categoryLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Feedback List */}
      <div className="space-y-3">
        {loading ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Loading feedback...</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No feedback found.</CardContent></Card>
        ) : (
          filtered.map(item => {
            const sc = statusConfig[item.status] || statusConfig.open;
            const isExpanded = expandedId === item.id;
            return (
              <Card key={item.id} className="overflow-hidden transition-all duration-200 hover:shadow-md">
                <button
                  className="w-full text-left"
                  onClick={() => { setExpandedId(isExpanded ? null : item.id); setResponseText(item.admin_response || ""); }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-foreground truncate">{item.subject}</h3>
                          <Badge variant="outline" className={sc.color}>{sc.label}</Badge>
                          <Badge variant="secondary" className="text-xs">{categoryLabels[item.category] || item.category}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{item.user_name}</span>
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(item.created_at), "MMM d, yyyy h:mm a")}</span>
                          {item.rating && (
                            <span className="flex items-center gap-0.5">
                              {Array.from({ length: item.rating }).map((_, i) => (
                                <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />}
                    </div>
                  </CardContent>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="mt-3 rounded-lg bg-muted/50 p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{item.message}</p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">From: {item.user_email}</p>

                    <Separator className="my-3" />

                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-foreground">Status:</span>
                      <Select value={item.status} onValueChange={v => handleStatusChange(item.id, v)}>
                        <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {item.admin_response && item.status === "resolved" && (
                      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 mb-3">
                        <p className="text-xs font-medium text-green-600 mb-1 flex items-center gap-1">
                          <Bell className="h-3 w-3" /> Admin Response (user notified):
                        </p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{item.admin_response}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Textarea
                        placeholder="Write your response..."
                        value={responseText}
                        onChange={e => setResponseText(e.target.value)}
                        rows={3}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{responseText.length} characters</p>
                        <Button size="sm" onClick={() => handleRespond(item.id)} disabled={responding || !responseText.trim()}>
                          <Send className="mr-2 h-4 w-4" />
                          {responding ? "Sending..." : "Send & Resolve"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AdminFeedbackView;
