import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Share2, Twitter, Facebook, Linkedin, Link2, CheckCircle,
  Trophy, Star, Target, TrendingUp, Award,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: "trophy" | "star" | "target" | "trending" | "award";
  value: string;
  color: string;
}

interface SocialShareCardProps {
  userName: string;
  achievements?: Achievement[];
}

const defaultAchievements: Achievement[] = [
  { id: "1", title: "Forms Submitted", description: "Total data collection submissions", icon: "target", value: "0", color: "from-blue-500 to-cyan-400" },
  { id: "2", title: "Days Active", description: "Consecutive field days", icon: "trending", value: "0", color: "from-emerald-500 to-teal-400" },
  { id: "3", title: "Quality Score", description: "Data accuracy rating", icon: "star", value: "A+", color: "from-amber-500 to-orange-400" },
  { id: "4", title: "Top Performer", description: "Team ranking this month", icon: "trophy", value: "#1", color: "from-purple-500 to-pink-400" },
];

const iconMap = {
  trophy: Trophy,
  star: Star,
  target: Target,
  trending: TrendingUp,
  award: Award,
};

const SocialShareCard = ({ userName, achievements = defaultAchievements }: SocialShareCardProps) => {
  const [copied, setCopied] = useState(false);

  const shareText = `🎯 Check out my field data collection achievements!\n\n${achievements.map(a => `${a.title}: ${a.value}`).join("\n")}\n\n— ${userName}\n\n#DataCollection #FieldWork #ACGCollect`;

  const shareUrl = window.location.origin;

  const shareToTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, "_blank");
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`, "_blank");
  };

  const shareToLinkedin = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, "_blank");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareText + "\n" + shareUrl);
    setCopied(true);
    toast({ title: "Copied!", description: "Share link copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "My Achievements — ACG Collect", text: shareText, url: shareUrl });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  return (
    <div className="space-y-6">
      {/* Achievement Cards */}
      <div className="grid grid-cols-2 gap-3">
        {achievements.map(achievement => {
          const Icon = iconMap[achievement.icon];
          return (
            <div
              key={achievement.id}
              className={`relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-br ${achievement.color} shadow-lg`}
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
              <Icon className="h-6 w-6 mb-2 drop-shadow" />
              <p className="text-2xl font-bold drop-shadow">{achievement.value}</p>
              <p className="text-sm font-medium opacity-90">{achievement.title}</p>
              <p className="text-[10px] opacity-70 mt-0.5">{achievement.description}</p>
            </div>
          );
        })}
      </div>

      {/* Share Section */}
      <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-5 space-y-4">
          <div className="text-center">
            <h3 className="font-display text-lg font-bold text-foreground flex items-center justify-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Share Your Progress
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Let your network know about your data collection achievements!
            </p>
          </div>

          {/* Preview Card */}
          <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-sm font-bold">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{userName}</p>
                <p className="text-[10px] text-muted-foreground">Field Data Collector</p>
              </div>
              <Badge className="ml-auto text-[10px] bg-gradient-to-r from-amber-500 to-orange-400 text-white border-0">
                <Award className="h-3 w-3 mr-1" />Top Performer
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-line">{shareText.slice(0, 120)}...</p>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button
              onClick={shareToTwitter}
              className="gap-2 bg-[hsl(204,88%,53%)] hover:bg-[hsl(204,88%,45%)] text-white"
              size="sm"
            >
              <Twitter className="h-4 w-4" /> Twitter
            </Button>
            <Button
              onClick={shareToFacebook}
              className="gap-2 bg-[hsl(220,46%,48%)] hover:bg-[hsl(220,46%,40%)] text-white"
              size="sm"
            >
              <Facebook className="h-4 w-4" /> Facebook
            </Button>
            <Button
              onClick={shareToLinkedin}
              className="gap-2 bg-[hsl(210,76%,42%)] hover:bg-[hsl(210,76%,35%)] text-white"
              size="sm"
            >
              <Linkedin className="h-4 w-4" /> LinkedIn
            </Button>
            <Button
              onClick={copyLink}
              variant="outline"
              className="gap-2"
              size="sm"
            >
              {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          {navigator.share && (
            <Button onClick={nativeShare} variant="acg" className="w-full gap-2">
              <Share2 className="h-4 w-4" /> Share via Device
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SocialShareCard;
