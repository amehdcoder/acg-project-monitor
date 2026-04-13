import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, HandMetal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface SignLanguageImageProps {
  phrase: string;
  signLanguage: string;
  signDescription: string;
  category: string;
  className?: string;
}

// In-memory cache to avoid re-generating during session
const imageCache = new Map<string, string>();

// Track if AI generation is unavailable so we stop retrying
let aiUnavailable = false;

// Deterministic pastel color from string
function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = ((hash % 360) + 360) % 360;
  return `hsl(${h}, 55%, 88%)`;
}

// Pick a hand emoji based on category
function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
    greetings: "👋", consent: "🤝", health: "🏥", survey: "📋",
    numbers: "🔢", responses: "✋", form_questions: "📝",
    emotions: "😊", directions: "👆", time: "🕐",
  };
  return map[category] || "🤟";
}

const FallbackIllustration = ({
  phrase, signDescription, category, className,
}: { phrase: string; signDescription: string; category: string; className: string }) => {
  const bg = hashColor(phrase + category);
  const emoji = categoryEmoji(category);

  return (
    <div
      className={`flex flex-col items-center justify-center p-4 rounded-xl ${className}`}
      style={{ background: `linear-gradient(135deg, ${bg}, ${bg}44)` }}
    >
      <span className="text-4xl mb-2" role="img" aria-label="sign">{emoji}</span>
      <p className="text-sm font-semibold text-foreground text-center leading-snug max-w-[90%]">
        "{phrase}"
      </p>
      <p className="text-[11px] text-muted-foreground text-center mt-1.5 leading-relaxed max-w-[85%] line-clamp-3">
        {signDescription}
      </p>
    </div>
  );
};

const SignLanguageImage = ({
  phrase,
  signLanguage,
  signDescription,
  category,
  className = "",
}: SignLanguageImageProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [triedOnce, setTriedOnce] = useState(false);

  const cacheKey = `${phrase}::${signLanguage}::${category}`;

  const generateImage = useCallback(async (manual = false) => {
    // If AI is known unavailable and this isn't a manual retry, skip
    if (aiUnavailable && !manual) {
      setError(true);
      setTriedOnce(true);
      return;
    }

    // Check memory cache
    const cached = imageCache.get(cacheKey);
    if (cached) {
      setImageUrl(cached);
      return;
    }

    // Check localStorage cache
    const storedKey = `sign_img_${btoa(cacheKey).slice(0, 40)}`;
    try {
      const stored = localStorage.getItem(storedKey);
      if (stored) {
        setImageUrl(stored);
        imageCache.set(cacheKey, stored);
        return;
      }
    } catch {}

    setLoading(true);
    setError(false);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "generate-sign-image",
        {
          body: { phrase, signLanguage, signDescription, category },
        }
      );

      if (fnError) throw new Error(fnError.message);

      // Check for credit/fallback errors from the function
      if (data?.fallback || data?.error) {
        // Mark AI as unavailable to prevent hammering
        aiUnavailable = true;
        throw new Error(data.error || "AI unavailable");
      }

      if (!data?.imageUrl) throw new Error("No image returned");

      setImageUrl(data.imageUrl);
      imageCache.set(cacheKey, data.imageUrl);

      // Persist to localStorage
      try {
        localStorage.setItem(storedKey, data.imageUrl);
      } catch {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("sign_img_"));
        keys.slice(0, Math.floor(keys.length / 2)).forEach((k) => localStorage.removeItem(k));
      }
    } catch (err) {
      console.error("Sign image generation error:", err);
      setError(true);
    } finally {
      setLoading(false);
      setTriedOnce(true);
    }
  }, [cacheKey, phrase, signLanguage, signDescription, category]);

  useEffect(() => {
    generateImage();
  }, [generateImage]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-xl ${className}`}>
        <div className="text-center space-y-1">
          <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
          <p className="text-[10px] text-muted-foreground">Generating...</p>
        </div>
      </div>
    );
  }

  // Show fallback illustration when AI fails — much better than a "Retry" button
  if (error || !imageUrl) {
    return (
      <div className="relative group">
        <FallbackIllustration
          phrase={phrase}
          signDescription={signDescription}
          category={category}
          className={className}
        />
        {/* Small retry button only shown on hover for manual retry */}
        {triedOnce && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              aiUnavailable = false;
              generateImage(true);
            }}
            className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background"
            title="Try generating AI illustration"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden relative group ${className}`}>
      <img
        src={imageUrl}
        alt={`Sign language illustration for: ${phrase}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          imageCache.delete(cacheKey);
          const storedKey = `sign_img_${btoa(cacheKey).slice(0, 40)}`;
          try { localStorage.removeItem(storedKey); } catch {}
          setImageUrl(null);
          generateImage(true);
        }}
        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background"
      >
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  );
};

export default SignLanguageImage;
