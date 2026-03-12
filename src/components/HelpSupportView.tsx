import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  HelpCircle, Search, BookOpen, MessageSquare, FileText, Video,
  ChevronRight, ExternalLink, Mail, Phone, Globe, Shield,
  Smartphone, Wifi, BarChart3, Calculator, Brain, Users, MapPin,
  FolderOpen, Upload, Bell, Settings, Briefcase, LayoutTemplate,
  Zap, CheckCircle, AlertTriangle
} from "lucide-react";

const FAQS = [
  {
    category: "Getting Started",
    questions: [
      { q: "How do I create my first form?", a: "Navigate to Forms from the sidebar, click 'Create Form', and use the drag-and-drop form builder to add questions. You can choose from 15+ question types including text, multiple choice, GPS, photo capture, and more." },
      { q: "How do I submit a form offline?", a: "ACG Collect works offline by default. Fill out any form without internet — your submission is saved locally and will automatically sync when connectivity is restored. Look for the sync indicator in the header." },
      { q: "What devices are supported?", a: "ACG Collect is a Progressive Web App (PWA) that works on any modern browser including Chrome, Safari, Firefox, and Edge on desktop, tablet, and mobile devices. Install it to your home screen for the best experience." },
    ]
  },
  {
    category: "Data Collection",
    questions: [
      { q: "How does GPS capture work?", a: "When a form requires location, your device's GPS will be activated to capture coordinates. Accuracy depends on your device and environment. You can configure GPS precision in Settings > Data Collection." },
      { q: "What is geofencing?", a: "Geofencing restricts form submissions to specific geographic areas. Administrators can define geofence boundaries per form or per user, ensuring data is only collected in authorized locations." },
      { q: "Can I attach photos and signatures?", a: "Yes! Forms support photo capture (camera or gallery), audio recording, barcode/QR scanning, and digital signatures. Media is compressed locally before syncing." },
      { q: "How do I scan QR codes to fill forms?", a: "Use the QR Scanner in the Forms view to scan a form's QR code. This instantly loads the correct form for data entry — useful for field deployments." },
    ]
  },
  {
    category: "Projects & Case Management",
    questions: [
      { q: "How do projects work?", a: "Projects are containers that group related forms, users, and data. Admins create projects, assign team members, and link forms. Users only see forms from projects they're assigned to." },
      { q: "What is case management?", a: "Case management tracks individuals or entities across multiple form submissions over time. Create case types, open cases, schedule follow-ups, and view the complete history of interactions." },
      { q: "How are daily targets tracked?", a: "Admins set daily submission targets per form per user. The dashboard shows real-time progress, and midday reminders are sent automatically for users behind target." },
    ]
  },
  {
    category: "Analytics & Reporting",
    questions: [
      { q: "How do I export my data?", a: "Go to Data & Analytics, select your project and form, then use the Export button to download as Excel (.xlsx) or CSV. You can also set up automatic Google Sheets sync." },
      { q: "What analytics are available?", a: "The platform provides submission trends, cross-tabulations, data quality scoring, text analysis, geographic visualizations, and custom dashboard builders with drag-and-drop widgets." },
      { q: "Can I build custom dashboards?", a: "Yes! Admin users can create custom dashboards using the Dashboard Builder. Add widgets like charts, maps, KPIs, and tables, then publish them for the team." },
    ]
  },
  {
    category: "Advanced Features",
    questions: [
      { q: "What AI/ML features are available?", a: "The Machine Learning Studio supports predictive modeling, anomaly detection, clustering, and time-series forecasting on your collected data. The Math Modeling module provides compartmental disease modeling with R₀ analysis and sensitivity analysis." },
      { q: "How does team chat work?", a: "Project Chat enables real-time messaging within project teams. Features include file sharing, reactions, voice/video calls, typing indicators, and read receipts." },
      { q: "Can I integrate with external tools?", a: "Yes! The Integrations view supports Google Sheets sync, Looker dashboard embedding, and more. API access is available for custom integrations." },
    ]
  },
];

const GUIDES = [
  { title: "Form Builder Guide", description: "Learn to create powerful forms with skip logic, validation, and groups", icon: FileText, category: "Forms" },
  { title: "Offline Data Collection", description: "Best practices for collecting data in areas with limited connectivity", icon: Wifi, category: "Data Collection" },
  { title: "Geofence Setup", description: "Configure geographic boundaries for form submissions", icon: MapPin, category: "Administration" },
  { title: "Dashboard Builder", description: "Create custom analytics dashboards with drag-and-drop widgets", icon: BarChart3, category: "Analytics" },
  { title: "Case Management Workflow", description: "Track subjects across follow-up visits with case management", icon: Briefcase, category: "Case Management" },
  { title: "Team Management", description: "Assign users to projects, set roles, and manage permissions", icon: Users, category: "Administration" },
  { title: "Mathematical Modeling", description: "Run compartmental disease models with AI-powered analysis", icon: Calculator, category: "Advanced" },
  { title: "Machine Learning Studio", description: "Build predictive models from your form submission data", icon: Brain, category: "Advanced" },
  { title: "Data Export & Integration", description: "Export data and sync with Google Sheets and Looker", icon: Upload, category: "Data Management" },
];

const KEYBOARD_SHORTCUTS = [
  { keys: ["Ctrl", "K"], action: "Quick search" },
  { keys: ["Ctrl", "N"], action: "New form" },
  { keys: ["Ctrl", "S"], action: "Save draft" },
  { keys: ["Ctrl", "/"], action: "Toggle sidebar" },
  { keys: ["Esc"], action: "Close dialog" },
];

const HelpSupportView = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const handleFeedbackSubmit = async () => {
    if (!feedbackSubject.trim() || !feedbackMessage.trim()) {
      toast({ title: "Missing fields", description: "Please fill in subject and message.", variant: "destructive" });
      return;
    }
    if (!user) {
      toast({ title: "Not authenticated", description: "Please log in to submit feedback.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("feedback").insert({
        user_id: user.id,
        category: feedbackCategory,
        subject: feedbackSubject.trim().slice(0, 200),
        message: feedbackMessage.trim().slice(0, 2000),
        rating: feedbackRating > 0 ? feedbackRating : null,
      });
      if (error) throw error;
      setFeedbackSubmitted(true);
      setFeedbackSubject("");
      setFeedbackMessage("");
      setFeedbackRating(0);
      toast({ title: "Feedback submitted!", description: "Thank you for your feedback. We'll review it shortly." });
    } catch (err: any) {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredFAQs = FAQS.map(cat => ({
    ...cat,
    questions: cat.questions.filter(q =>
      q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.a.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(cat => cat.questions.length > 0);

  const filteredGuides = GUIDES.filter(g =>
    g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1000px] mx-auto">
      <div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <HelpCircle className="h-7 w-7 text-primary" />
          </div>
          Help & Support
        </h1>
        <p className="mt-1 text-muted-foreground">Find answers, guides, and ways to get help</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search help topics, FAQs, guides..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 h-12 text-base"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md">
          <CardContent className="pt-5 pb-5 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10"><BookOpen className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-semibold text-foreground text-sm">Documentation</p>
              <p className="text-xs text-muted-foreground">Browse all guides</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md">
          <CardContent className="pt-5 pb-5 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-accent/20"><MessageSquare className="h-5 w-5 text-accent-foreground" /></div>
            <div>
              <p className="font-semibold text-foreground text-sm">Contact Support</p>
              <p className="text-xs text-muted-foreground">Get direct help</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md">
          <CardContent className="pt-5 pb-5 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-destructive/10"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="font-semibold text-foreground text-sm">Report Issue</p>
              <p className="text-xs text-muted-foreground">Submit a bug report</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="faq" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="faq">FAQs</TabsTrigger>
          <TabsTrigger value="guides">Guides</TabsTrigger>
          <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        {/* FAQs */}
        <TabsContent value="faq" className="space-y-4">
          {filteredFAQs.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No results found for "{searchQuery}"</p>
              </CardContent>
            </Card>
          ) : (
            filteredFAQs.map(cat => (
              <Card key={cat.category}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{cat.category}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="space-y-1">
                    {cat.questions.map((q, i) => (
                      <AccordionItem key={i} value={`${cat.category}-${i}`} className="border-none">
                        <AccordionTrigger className="text-sm text-left font-medium hover:no-underline py-3 px-3 rounded-lg hover:bg-muted/50">
                          {q.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground px-3 pb-3">
                          {q.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Guides */}
        <TabsContent value="guides" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredGuides.map((guide, i) => (
              <Card key={i} className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                      <guide.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-foreground text-sm">{guide.title}</p>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{guide.description}</p>
                      <Badge variant="secondary" className="mt-2 text-[10px]">{guide.category}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Shortcuts */}
        <TabsContent value="shortcuts">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Keyboard Shortcuts</CardTitle>
              <CardDescription>Speed up your workflow with these shortcuts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {KEYBOARD_SHORTCUTS.map((sc, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                    <span className="text-sm text-foreground">{sc.action}</span>
                    <div className="flex gap-1">
                      {sc.keys.map(k => (
                        <kbd key={k} className="px-2 py-1 rounded bg-muted text-xs font-mono text-muted-foreground border border-border">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact */}
        <TabsContent value="contact" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-5 w-5 text-primary" />Email Support</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">For technical issues, feature requests, or general inquiries</p>
                <a href="mailto:support@acgconsultinggroup.com" className="text-sm font-medium text-primary hover:underline">
                  support@acgconsultinggroup.com
                </a>
                <p className="text-xs text-muted-foreground mt-2">Response time: within 24 hours</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Phone className="h-5 w-5 text-primary" />Phone Support</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">For urgent issues during business hours (WAT)</p>
                <p className="text-sm font-medium text-foreground">Mon - Fri, 9:00 AM - 5:00 PM WAT</p>
                <p className="text-xs text-muted-foreground mt-2">Available for admin users</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { service: "Data Collection API", status: "operational" },
                  { service: "Real-time Sync", status: "operational" },
                  { service: "Authentication", status: "operational" },
                  { service: "File Storage", status: "operational" },
                  { service: "AI/ML Services", status: "operational" },
                ].map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm text-foreground">{s.service}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-xs text-green-600 capitalize">{s.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Feedback Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-5 w-5 text-primary" />
                Submit Feedback
              </CardTitle>
              <CardDescription>Share your experience, report issues, or suggest features</CardDescription>
            </CardHeader>
            <CardContent>
              {feedbackSubmitted ? (
                <div className="text-center py-8 space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-primary" />
                  </div>
                  <p className="font-semibold text-foreground">Thank you for your feedback!</p>
                  <p className="text-sm text-muted-foreground">Our team will review it and respond if needed.</p>
                  <Button variant="outline" size="sm" onClick={() => setFeedbackSubmitted(false)}>Submit Another</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Category</Label>
                      <Select value={feedbackCategory} onValueChange={setFeedbackCategory}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General Feedback</SelectItem>
                          <SelectItem value="bug">Bug Report</SelectItem>
                          <SelectItem value="feature">Feature Request</SelectItem>
                          <SelectItem value="performance">Performance Issue</SelectItem>
                          <SelectItem value="ui">UI/UX Feedback</SelectItem>
                          <SelectItem value="data">Data & Analytics</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">Rating (optional)</Label>
                      <div className="flex gap-1 mt-2">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            onClick={() => setFeedbackRating(star === feedbackRating ? 0 : star)}
                            className={`text-xl transition-colors ${star <= feedbackRating ? "text-accent-foreground" : "text-muted-foreground/30"} hover:text-accent-foreground`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Subject</Label>
                    <Input
                      value={feedbackSubject}
                      onChange={e => setFeedbackSubject(e.target.value)}
                      placeholder="Brief summary of your feedback"
                      maxLength={200}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Message</Label>
                    <Textarea
                      value={feedbackMessage}
                      onChange={e => setFeedbackMessage(e.target.value)}
                      placeholder="Describe your feedback, issue, or suggestion in detail..."
                      rows={4}
                      maxLength={2000}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1 text-right">{feedbackMessage.length}/2000</p>
                  </div>
                  <Button onClick={handleFeedbackSubmit} disabled={isSubmitting || !feedbackSubject.trim() || !feedbackMessage.trim()} className="w-full sm:w-auto gap-2">
                    {isSubmitting ? "Submitting..." : "Submit Feedback"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* About */}
        <TabsContent value="about">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Zap className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold text-foreground">ACG Collect</h2>
                  <p className="text-muted-foreground">Monitoring & Supervision Platform</p>
                  <Badge variant="secondary" className="mt-2">Version 1.0.0</Badge>
                </div>
                <Separator />
                <div className="text-sm text-muted-foreground space-y-1 max-w-md mx-auto">
                  <p>ACG Collect is a comprehensive mobile data collection and monitoring platform built for field operations, research, and program supervision.</p>
                  <p className="mt-3">Developed by <span className="font-semibold text-foreground">Amehnities Consulting Group (ACG)</span></p>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-4 text-center max-w-sm mx-auto">
                  <div>
                    <p className="text-2xl font-bold text-primary">15+</p>
                    <p className="text-xs text-muted-foreground">Question Types</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">PWA</p>
                    <p className="text-xs text-muted-foreground">Offline Ready</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">AI</p>
                    <p className="text-xs text-muted-foreground">Powered Analytics</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HelpSupportView;
