import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquareText, Lightbulb, TrendingUp, Hash } from "lucide-react";
import type { SubmissionRecord, FormAnalytics } from "@/hooks/useDataAnalytics";

interface TextAnalysisProps {
  submissions: SubmissionRecord[];
  selectedForm: FormAnalytics | null;
  loading?: boolean;
}

interface WordFrequency {
  word: string;
  count: number;
}

interface ThemeInsight {
  theme: string;
  count: number;
  examples: string[];
}

// Common stop words to filter out
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "as", "is", "was", "are", "were", "been", "be", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might", "must",
  "shall", "can", "need", "it", "its", "this", "that", "these", "those", "i", "you",
  "he", "she", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "our", "their", "what", "which", "who", "whom", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "also", "now", "here", "there", "then", "once", "na", "yes", "okay", "ok", "sir",
]);

// Theme keywords mapping for Nigerian health/development context
const THEME_KEYWORDS: Record<string, string[]> = {
  "Health Facility": ["hospital", "clinic", "health", "center", "phc", "facility", "medical"],
  "Water & Sanitation": ["water", "sanitation", "toilet", "latrine", "borehole", "well", "wash"],
  "Immunization": ["vaccine", "vaccination", "immunization", "polio", "measles", "routine"],
  "Maternal Health": ["pregnant", "antenatal", "delivery", "maternal", "birth", "midwife"],
  "Child Health": ["child", "children", "infant", "baby", "nutrition", "malnutrition"],
  "Community": ["community", "village", "settlement", "ward", "lga", "local"],
  "Education": ["school", "education", "teacher", "student", "learning", "training"],
  "Infrastructure": ["road", "building", "construction", "electricity", "power"],
  "Agriculture": ["farm", "farming", "crop", "livestock", "agriculture", "harvest"],
  "Positive": ["good", "excellent", "working", "functional", "available", "adequate"],
  "Negative": ["bad", "poor", "broken", "damaged", "lacking", "unavailable", "inadequate"],
};

const TextAnalysis = ({ submissions, selectedForm, loading }: TextAnalysisProps) => {
  // Extract text questions from form
  const textQuestions = useMemo(() => {
    if (!selectedForm || !selectedForm.questions) return [];

    const questions: any[] = [];
    const processQuestions = (items: any[]) => {
      items.forEach((item) => {
        if (item.questions) {
          processQuestions(item.questions);
        } else if (item.type === "text" || item.type === "note") {
          questions.push(item);
        }
      });
    };
    processQuestions(selectedForm.questions);
    return questions;
  }, [selectedForm]);

  // Analyze text responses
  const textAnalysis = useMemo(() => {
    const syncedSubmissions = submissions.filter((s) => s.status === "sent");
    
    // Collect all text responses
    const allResponses: string[] = [];
    textQuestions.forEach((question) => {
      syncedSubmissions.forEach((s) => {
        const response = s.data?.[question.id];
        if (response && typeof response === "string" && response.trim()) {
          allResponses.push(response.trim());
        }
      });
    });

    // Word frequency analysis
    const wordCounts: Record<string, number> = {};
    allResponses.forEach((response) => {
      const words = response.toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
      
      words.forEach((word) => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });
    });

    const topWords: WordFrequency[] = Object.entries(wordCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Theme detection
    const themes: ThemeInsight[] = [];
    Object.entries(THEME_KEYWORDS).forEach(([theme, keywords]) => {
      const matchingResponses = allResponses.filter((response) =>
        keywords.some((keyword) => response.toLowerCase().includes(keyword))
      );
      if (matchingResponses.length > 0) {
        themes.push({
          theme,
          count: matchingResponses.length,
          examples: matchingResponses.slice(0, 3),
        });
      }
    });
    themes.sort((a, b) => b.count - a.count);

    // Response length analysis
    const lengths = allResponses.map((r) => r.split(/\s+/).length);
    const avgLength = lengths.length > 0 
      ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) 
      : 0;

    return {
      totalResponses: allResponses.length,
      avgLength,
      topWords,
      themes: themes.slice(0, 6),
      sampleResponses: allResponses.slice(0, 5),
    };
  }, [submissions, textQuestions]);

  if (loading) {
    return (
      <Card className="border-0 shadow-card animate-pulse">
        <CardHeader>
          <div className="h-6 w-40 bg-muted rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (textQuestions.length === 0) {
    return null;
  }

  if (textAnalysis.totalResponses === 0) {
    return (
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            Text Response Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          <p>No text responses available for analysis.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-card">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          Text Response Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{textAnalysis.totalResponses}</p>
            <p className="text-sm text-muted-foreground">Text Responses</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{textAnalysis.avgLength}</p>
            <p className="text-sm text-muted-foreground">Avg Words/Response</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{textAnalysis.themes.length}</p>
            <p className="text-sm text-muted-foreground">Themes Detected</p>
          </div>
        </div>

        {/* Themes */}
        {textAnalysis.themes.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 font-medium text-foreground mb-3">
              <Lightbulb className="h-4 w-4 text-acg-gold" />
              Key Themes
            </h4>
            <div className="flex flex-wrap gap-2">
              {textAnalysis.themes.map((theme) => (
                <Badge
                  key={theme.theme}
                  variant="secondary"
                  className="px-3 py-1 text-sm"
                >
                  {theme.theme}
                  <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                    {theme.count}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Word Cloud (as tags) */}
        {textAnalysis.topWords.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 font-medium text-foreground mb-3">
              <Hash className="h-4 w-4 text-blue-600" />
              Frequent Words
            </h4>
            <div className="flex flex-wrap gap-2">
              {textAnalysis.topWords.slice(0, 15).map((item, index) => (
                <span
                  key={item.word}
                  className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm"
                  style={{
                    fontSize: `${Math.max(0.75, Math.min(1.25, 0.75 + (item.count / textAnalysis.topWords[0].count) * 0.5))}rem`,
                    opacity: Math.max(0.6, 1 - index * 0.03),
                  }}
                >
                  {item.word}
                  <span className="ml-1 text-xs text-muted-foreground">({item.count})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Sample Responses */}
        {textAnalysis.sampleResponses.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 font-medium text-foreground mb-3">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Sample Responses
            </h4>
            <div className="space-y-2">
              {textAnalysis.sampleResponses.map((response, index) => (
                <div
                  key={index}
                  className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground italic"
                >
                  "{response.length > 150 ? response.slice(0, 150) + "..." : response}"
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TextAnalysis;
