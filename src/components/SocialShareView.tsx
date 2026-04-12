import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import SocialShareCard from "@/components/SocialShareCard";
import { Share2 } from "lucide-react";

const SocialShareView = () => {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ submissions: 0, days: 0, forms: 0 });

  useEffect(() => {
    if (!user?.id) return;
    const fetchStats = async () => {
      const { count: submissionCount } = await supabase.from("form_submissions").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const { data: activity } = await supabase.from("field_activity").select("started_at").eq("user_id", user.id);
      const uniqueDays = new Set((activity || []).map(a => a.started_at?.slice(0, 10))).size;
      setStats({ submissions: submissionCount || 0, days: uniqueDays || 0, forms: 0 });
    };
    fetchStats();
  }, [user?.id]);

  const userName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "User";

  const achievements = [
    { id: "1", title: "Forms Submitted", description: "Total data collection submissions", icon: "target" as const, value: String(stats.submissions), color: "from-blue-500 to-cyan-400" },
    { id: "2", title: "Days Active", description: "Consecutive field days", icon: "trending" as const, value: String(stats.days), color: "from-emerald-500 to-teal-400" },
    { id: "3", title: "Quality Score", description: "Data accuracy rating", icon: "star" as const, value: stats.submissions > 50 ? "A+" : stats.submissions > 20 ? "A" : "B+", color: "from-amber-500 to-orange-400" },
    { id: "4", title: "Engagement", description: "Activity level", icon: "trophy" as const, value: stats.days > 30 ? "🔥 High" : stats.days > 10 ? "⭐ Good" : "📊 Growing", color: "from-purple-500 to-pink-400" },
  ];

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[700px] mx-auto">
      <div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Share2 className="h-7 w-7 text-primary" />
          </div>
          Share Your Progress
        </h1>
        <p className="text-muted-foreground mt-1">
          Showcase your data collection achievements on social media
        </p>
      </div>

      <SocialShareCard userName={userName} achievements={achievements} />
    </div>
  );
};

export default SocialShareView;
