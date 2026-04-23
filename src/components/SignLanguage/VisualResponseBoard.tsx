import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, HelpCircle, ThumbsUp, ThumbsDown, Volume2, RotateCcw } from "lucide-react";

interface ResponseItem {
  id: string;
  label: string;
  emoji: string;
  color: string;
  category: string;
}

const RESPONSE_ITEMS: ResponseItem[] = [
  // Yes/No/Maybe
  { id: "yes", label: "Yes", emoji: "✅", color: "bg-green-500/15 border-green-500/30 text-green-700 dark:text-green-400", category: "basic" },
  { id: "no", label: "No", emoji: "❌", color: "bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-400", category: "basic" },
  { id: "maybe", label: "Maybe / Not Sure", emoji: "🤷", color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-700 dark:text-yellow-400", category: "basic" },
  { id: "dont_understand", label: "I don't understand", emoji: "❓", color: "bg-orange-500/15 border-orange-500/30 text-orange-700 dark:text-orange-400", category: "basic" },
  // Numbers
  { id: "0", label: "0", emoji: "0️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "1", label: "1", emoji: "1️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "2", label: "2", emoji: "2️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "3", label: "3", emoji: "3️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "4", label: "4", emoji: "4️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "5", label: "5", emoji: "5️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "6", label: "6", emoji: "6️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "7", label: "7", emoji: "7️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "8", label: "8", emoji: "8️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "9", label: "9", emoji: "9️⃣", color: "bg-muted border-border", category: "numbers" },
  { id: "10", label: "10", emoji: "🔟", color: "bg-muted border-border", category: "numbers" },
  // Pain/severity
  { id: "pain_0", label: "No Pain", emoji: "😊", color: "bg-green-500/10 border-green-500/20", category: "pain" },
  { id: "pain_2", label: "Mild", emoji: "🙂", color: "bg-lime-500/10 border-lime-500/20", category: "pain" },
  { id: "pain_4", label: "Moderate", emoji: "😐", color: "bg-yellow-500/10 border-yellow-500/20", category: "pain" },
  { id: "pain_6", label: "Significant", emoji: "😣", color: "bg-orange-500/10 border-orange-500/20", category: "pain" },
  { id: "pain_8", label: "Severe", emoji: "😫", color: "bg-red-500/10 border-red-500/20", category: "pain" },
  { id: "pain_10", label: "Worst Possible", emoji: "😭", color: "bg-red-600/15 border-red-600/30", category: "pain" },
  // Time references
  { id: "today", label: "Today", emoji: "📅", color: "bg-blue-500/10 border-blue-500/20", category: "time" },
  { id: "yesterday", label: "Yesterday", emoji: "⬅️", color: "bg-blue-500/10 border-blue-500/20", category: "time" },
  { id: "this_week", label: "This Week", emoji: "📆", color: "bg-blue-500/10 border-blue-500/20", category: "time" },
  { id: "long_ago", label: "Long Time Ago", emoji: "⏳", color: "bg-blue-500/10 border-blue-500/20", category: "time" },
  // Body parts (for health surveys)
  { id: "head", label: "Head", emoji: "🧠", color: "bg-purple-500/10 border-purple-500/20", category: "body" },
  { id: "eyes", label: "Eyes", emoji: "👁️", color: "bg-purple-500/10 border-purple-500/20", category: "body" },
  { id: "chest", label: "Chest", emoji: "🫁", color: "bg-purple-500/10 border-purple-500/20", category: "body" },
  { id: "stomach", label: "Stomach", emoji: "🤰", color: "bg-purple-500/10 border-purple-500/20", category: "body" },
  { id: "legs", label: "Legs", emoji: "🦵", color: "bg-purple-500/10 border-purple-500/20", category: "body" },
  { id: "skin", label: "Skin", emoji: "🖐️", color: "bg-purple-500/10 border-purple-500/20", category: "body" },
  // Frequency
  { id: "always", label: "Always", emoji: "🔄", color: "bg-indigo-500/10 border-indigo-500/20", category: "frequency" },
  { id: "sometimes", label: "Sometimes", emoji: "〰️", color: "bg-indigo-500/10 border-indigo-500/20", category: "frequency" },
  { id: "rarely", label: "Rarely", emoji: "🔹", color: "bg-indigo-500/10 border-indigo-500/20", category: "frequency" },
  { id: "never", label: "Never", emoji: "⛔", color: "bg-indigo-500/10 border-indigo-500/20", category: "frequency" },
];

const BOARD_CATEGORIES = [
  { id: "basic", label: "Yes / No" },
  { id: "numbers", label: "Numbers" },
  { id: "pain", label: "Pain Scale" },
  { id: "time", label: "Time" },
  { id: "body", label: "Body Parts" },
  { id: "frequency", label: "Frequency" },
];

const VisualResponseBoard = () => {
  const [selectedResponses, setSelectedResponses] = useState<string[]>([]);
  const [activeBoardCategory, setActiveBoardCategory] = useState("basic");

  const toggleResponse = (id: string) => {
    setSelectedResponses(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const speakLabel = (label: string) => {
    // Route through unified TTS service for reliable cross-browser playback.
    void tts.speak(label, { rate: 0.8, pitch: 1.0 });
  };

  const filtered = RESPONSE_ITEMS.filter(r => r.category === activeBoardCategory);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-primary" />
            Visual Communication Board (AAC)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Show this board to the respondent. They can point to or tap symbols to answer your questions.
            This follows Augmentative and Alternative Communication (AAC) standards.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Category selector */}
          <div className="flex flex-wrap gap-1.5">
            {BOARD_CATEGORIES.map(cat => (
              <Button
                key={cat.id}
                size="sm"
                variant={activeBoardCategory === cat.id ? "default" : "outline"}
                onClick={() => setActiveBoardCategory(cat.id)}
                className="text-xs h-8"
              >
                {cat.label}
              </Button>
            ))}
          </div>

          {/* Response grid */}
          <div className={`grid gap-3 ${
            activeBoardCategory === "numbers" ? "grid-cols-4 sm:grid-cols-6" :
            activeBoardCategory === "pain" ? "grid-cols-3 sm:grid-cols-6" :
            "grid-cols-2 sm:grid-cols-4"
          }`}>
            {filtered.map(item => {
              const isSelected = selectedResponses.includes(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => { toggleResponse(item.id); speakLabel(item.label); }}
                  className={`relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 min-h-[80px] ${item.color} ${
                    isSelected ? "ring-2 ring-primary ring-offset-2 scale-105 shadow-lg" : "hover:scale-102 hover:shadow-md"
                  }`}
                  aria-label={item.label}
                >
                  <span className="text-3xl sm:text-4xl mb-1">{item.emoji}</span>
                  <span className="text-xs sm:text-sm font-semibold text-center leading-tight">{item.label}</span>
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected responses summary */}
          {selectedResponses.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground">Responses:</span>
                {selectedResponses.map(id => {
                  const item = RESPONSE_ITEMS.find(r => r.id === id);
                  return item ? (
                    <Badge key={id} variant="secondary" className="text-xs gap-1">
                      {item.emoji} {item.label}
                    </Badge>
                  ) : null;
                })}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedResponses([])}
                className="h-7 text-xs gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VisualResponseBoard;
