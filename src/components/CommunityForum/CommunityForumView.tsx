import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  MessageSquare, Heart, Pin, Plus, Search, Clock, TrendingUp,
  Send, ArrowLeft, Trash2, MoreHorizontal, Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const CATEGORIES = [
  { value: "general", label: "General", color: "bg-primary/10 text-primary" },
  { value: "tips", label: "Tips & Tricks", color: "bg-emerald-500/10 text-emerald-600" },
  { value: "bugs", label: "Bug Reports", color: "bg-destructive/10 text-destructive" },
  { value: "features", label: "Feature Requests", color: "bg-amber-500/10 text-amber-600" },
  { value: "help", label: "Help & Support", color: "bg-blue-500/10 text-blue-600" },
  { value: "showcase", label: "Showcase", color: "bg-purple-500/10 text-purple-600" },
];

interface Post {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  likes_count: number;
  replies_count: number;
  created_at: string;
  author_name?: string;
  author_initials?: string;
  liked_by_me?: boolean;
}

interface Reply {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  likes_count: number;
  created_at: string;
  author_name?: string;
  author_initials?: string;
}

const CommunityForumView = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "popular">("recent");
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchPosts = useCallback(async () => {
    const { data: postsData } = await supabase.from("forum_posts").select("*").order("is_pinned", { ascending: false }).order(sortBy === "recent" ? "created_at" : "likes_count", { ascending: false });
    if (!postsData) return;

    const userIds = [...new Set(postsData.map((p: any) => p.user_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds);
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    let myLikes: Set<string> = new Set();
    if (user) {
      const { data: likes } = await supabase.from("forum_likes").select("post_id").eq("user_id", user.id).not("post_id", "is", null);
      myLikes = new Set((likes || []).map((l: any) => l.post_id));
    }

    setPosts(postsData.map((p: any) => {
      const prof = profileMap.get(p.user_id);
      return {
        ...p,
        author_name: prof ? `${prof.first_name} ${prof.last_name}`.trim() : "Unknown",
        author_initials: prof ? `${(prof.first_name || "U")[0]}${(prof.last_name || "")[0]}`.toUpperCase() : "U",
        liked_by_me: myLikes.has(p.id),
      };
    }));
    setLoading(false);
  }, [user, sortBy]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  useEffect(() => {
    const channel = supabase.channel("forum-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_posts" }, () => fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_replies" }, () => { if (selectedPost) fetchReplies(selectedPost.id); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPosts, selectedPost]);

  const fetchReplies = async (postId: string) => {
    const { data } = await supabase.from("forum_replies").select("*").eq("post_id", postId).order("created_at", { ascending: true });
    if (!data) return;
    const userIds = [...new Set(data.map((r: any) => r.user_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds);
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    setReplies(data.map((r: any) => {
      const prof = profileMap.get(r.user_id);
      return { ...r, author_name: prof ? `${prof.first_name} ${prof.last_name}`.trim() : "Unknown", author_initials: prof ? `${(prof.first_name || "U")[0]}${(prof.last_name || "")[0]}`.toUpperCase() : "U" };
    }));
  };

  const handleCreatePost = async () => {
    if (!newTitle.trim() || !newContent.trim() || !user) return;
    setSubmitting(true);
    const { error } = await supabase.from("forum_posts").insert({ user_id: user.id, title: newTitle.trim(), content: newContent.trim(), category: newCategory });
    setSubmitting(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setNewTitle(""); setNewContent(""); setNewCategory("general"); setShowNewPost(false);
    toast({ title: "Post Created", description: "Your discussion has been posted!" });
    fetchPosts();
  };

  const handleLikePost = async (post: Post) => {
    if (!user) return;
    if (post.liked_by_me) {
      await supabase.from("forum_likes").delete().eq("user_id", user.id).eq("post_id", post.id);
      await supabase.from("forum_posts").update({ likes_count: Math.max(0, post.likes_count - 1) }).eq("id", post.id);
    } else {
      await supabase.from("forum_likes").insert({ user_id: user.id, post_id: post.id });
      await supabase.from("forum_posts").update({ likes_count: post.likes_count + 1 }).eq("id", post.id);
    }
    fetchPosts();
  };

  const handleReply = async () => {
    if (!replyContent.trim() || !user || !selectedPost) return;
    setSubmitting(true);
    const { error } = await supabase.from("forum_replies").insert({ post_id: selectedPost.id, user_id: user.id, content: replyContent.trim() });
    setSubmitting(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setReplyContent("");
    fetchReplies(selectedPost.id);
  };

  const handleDeletePost = async (postId: string) => {
    await supabase.from("forum_posts").delete().eq("id", postId);
    setSelectedPost(null);
    fetchPosts();
    toast({ title: "Deleted", description: "Post removed." });
  };

  const filteredPosts = posts.filter(p => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getCategoryStyle = (cat: string) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[0];

  if (selectedPost) {
    return (
      <div className="space-y-4 p-2 sm:p-4 lg:p-6 max-w-[900px] mx-auto">
        <Button variant="ghost" onClick={() => setSelectedPost(null)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Forum</Button>
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{selectedPost.author_initials}</AvatarFallback></Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedPost.author_name}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(selectedPost.created_at), { addSuffix: true })}</p>
                </div>
              </div>
              {selectedPost.user_id === user?.id && (
                <Button variant="ghost" size="icon" onClick={() => handleDeletePost(selectedPost.id)} className="text-destructive h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
              )}
            </div>
            <Badge className={`w-fit mt-2 ${getCategoryStyle(selectedPost.category).color}`}>{getCategoryStyle(selectedPost.category).label}</Badge>
            <CardTitle className="text-lg mt-2">{selectedPost.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{selectedPost.content}</p>
            <div className="flex items-center gap-4 mt-4 text-muted-foreground text-xs">
              <button onClick={() => handleLikePost(selectedPost)} className={`flex items-center gap-1 transition ${selectedPost.liked_by_me ? "text-pink-500" : "hover:text-pink-500"}`}>
                <Heart className={`h-4 w-4 ${selectedPost.liked_by_me ? "fill-pink-500" : ""}`} /> {selectedPost.likes_count}
              </button>
              <span className="flex items-center gap-1"><MessageSquare className="h-4 w-4" /> {selectedPost.replies_count} replies</span>
            </div>
          </CardContent>
        </Card>

        <Separator />
        <h3 className="font-semibold text-foreground text-sm">Replies ({replies.length})</h3>

        <ScrollArea className="max-h-[40vh]">
          <div className="space-y-3">
            {replies.map(r => (
              <Card key={r.id} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px] bg-muted font-semibold">{r.author_initials}</AvatarFallback></Avatar>
                    <span className="text-xs font-medium text-foreground">{r.author_name}</span>
                    <span className="text-xs text-muted-foreground">• {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{r.content}</p>
                </CardContent>
              </Card>
            ))}
            {replies.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No replies yet. Be the first to respond!</p>}
          </div>
        </ScrollArea>

        <div className="flex gap-2">
          <Textarea placeholder="Write a reply..." value={replyContent} onChange={e => setReplyContent(e.target.value)} className="min-h-[60px]" />
          <Button onClick={handleReply} disabled={submitting || !replyContent.trim()} className="self-end gap-1"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2 sm:p-4 lg:p-6 max-w-[900px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Community Forum</h1>
            <p className="text-xs text-muted-foreground">{posts.length} discussions • Share and learn together</p>
          </div>
        </div>
        <Dialog open={showNewPost} onOpenChange={setShowNewPost}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> New Post</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create a Discussion</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Title</Label><Input placeholder="What's on your mind?" value={newTitle} onChange={e => setNewTitle(e.target.value)} /></div>
              <div><Label>Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Content</Label><Textarea placeholder="Share your thoughts..." value={newContent} onChange={e => setNewContent(e.target.value)} className="min-h-[120px]" /></div>
              <Button onClick={handleCreatePost} disabled={submitting || !newTitle.trim() || !newContent.trim()} className="w-full">{submitting ? "Posting..." : "Post Discussion"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search discussions..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent"><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Recent</span></SelectItem>
            <SelectItem value="popular"><span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Popular</span></SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading discussions...</div>
      ) : filteredPosts.length === 0 ? (
        <Card className="border-dashed"><CardContent className="text-center py-12"><MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" /><p className="text-muted-foreground">No discussions yet. Start one!</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filteredPosts.map(post => (
            <Card key={post.id} className={`cursor-pointer transition hover:border-primary/30 hover:shadow-sm ${post.is_pinned ? "border-primary/40 bg-primary/5" : ""}`} onClick={() => { setSelectedPost(post); fetchReplies(post.id); }}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 mt-0.5"><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{post.author_initials}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {post.is_pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                      <h3 className="font-semibold text-sm text-foreground truncate">{post.title}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getCategoryStyle(post.category).color}`}>{getCategoryStyle(post.category).label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{post.author_name}</span>
                      <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                      <span className="flex items-center gap-1"><Heart className={`h-3 w-3 ${post.liked_by_me ? "fill-pink-500 text-pink-500" : ""}`} /> {post.likes_count}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {post.replies_count}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommunityForumView;
