import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Accessibility, Eye, Ear, Hand, Globe, Heart, Users, Shield } from "lucide-react";

const AccessibilityStatementView = () => {
  return (
    <div className="space-y-6 p-2 sm:p-4 lg:p-6 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Accessibility className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Accessibility Statement</h1>
          <p className="text-sm text-muted-foreground">Our commitment to inclusion and equal access</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-primary" /> Our Commitment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-foreground leading-relaxed">
          <p>
            ACG Monitor is committed to ensuring digital accessibility for people with disabilities and all users regardless
            of gender, ability, or background. We continually improve the user experience for everyone and apply the relevant
            accessibility standards to ensure we provide equal access to all users.
          </p>
          <p>
            We strive to conform to the <strong>Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</strong> and follow
            best practices recommended by the <strong>World Health Organization (WHO)</strong> for inclusive health data
            collection tools.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> Visual Accessibility</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <ul className="list-disc pl-4 space-y-1">
              <li>Adjustable font sizes for improved readability</li>
              <li>Color vision deficiency (CVD) support with multiple color scheme options</li>
              <li>High contrast mode available</li>
              <li>Dark and light theme support</li>
              <li>Semantic HTML for screen reader compatibility</li>
              <li>Alt text on all informational images</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Ear className="h-4 w-4 text-primary" /> Hearing Accessibility</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <ul className="list-disc pl-4 space-y-1">
              <li>Visual indicators for all audio notifications</li>
              <li>Sign language teaching resources for Nigerian languages</li>
              <li>Text-based alternatives for audio content</li>
              <li>Visual confirmation for all user actions</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Hand className="h-4 w-4 text-primary" /> Motor Accessibility</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <ul className="list-disc pl-4 space-y-1">
              <li>Touch-friendly targets (minimum 44x44px)</li>
              <li>Keyboard navigation support</li>
              <li>Swipe gestures for mobile navigation</li>
              <li>Minimal scrolling required for critical actions</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> Language & Cognitive</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <ul className="list-disc pl-4 space-y-1">
              <li>Support for 10+ languages including RTL scripts</li>
              <li>Nigerian local sign language resources</li>
              <li>Clear, simple language in all interfaces</li>
              <li>Consistent navigation and predictable layouts</li>
              <li>Progress indicators for multi-step processes</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Gender & Social Inclusion</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground leading-relaxed space-y-3">
          <p>
            ACG Monitor is designed with <strong>Gender Equality and Social Inclusion (GESI)</strong> principles at its core:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Gender-neutral language throughout the platform</li>
            <li>Inclusive data collection forms that respect diverse identities</li>
            <li>Privacy-first design to protect vulnerable populations</li>
            <li>Community-based data collection approaches that empower local participation</li>
            <li>Training materials available in local Nigerian languages and sign languages</li>
            <li>Disability-inclusive NTD case management tools</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Feedback & Contact</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground leading-relaxed space-y-3">
          <p>
            We welcome your feedback on the accessibility of ACG Monitor. If you encounter accessibility barriers or have
            suggestions for improvement, please contact us through the in-app Feedback feature or reach out to your
            project administrator.
          </p>
          <p className="text-muted-foreground">
            We aim to respond to accessibility feedback within 5 business days.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline">WCAG 2.1 AA</Badge>
            <Badge variant="outline">Section 508</Badge>
            <Badge variant="outline">GESI Compliant</Badge>
            <Badge variant="outline">WHO Standards</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccessibilityStatementView;
