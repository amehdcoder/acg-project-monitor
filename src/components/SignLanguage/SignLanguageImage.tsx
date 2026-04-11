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

  const cacheKey = `${phrase}::${signLanguage}::${category}`;

  const generateImage = useCallback(async () => {
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

      if (fnError || !data?.imageUrl) {
        throw new Error(fnError?.message || "No image returned");
      }

      setImageUrl(data.imageUrl);
      imageCache.set(cacheKey, data.imageUrl);

      // Persist to localStorage (trim if too large)
      try {
        localStorage.setItem(storedKey, data.imageUrl);
      } catch {
        // Storage full, clear old sign images
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("sign_img_"));
        keys.slice(0, Math.floor(keys.length / 2)).forEach((k) => localStorage.removeItem(k));
      }
    } catch (err) {
      console.error("Sign image generation error:", err);
      setError(true);
    } finally {
      setLoading(false);
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

  if (error || !imageUrl) {
    return (
      <div className={`flex items-center justify-center bg-muted/20 rounded-xl ${className}`}>
        <div className="text-center space-y-1">
          <HandMetal className="h-5 w-5 text-muted-foreground mx-auto" />
          <Button
            variant="ghost"
            size="sm"
            onClick={generateImage}
            className="h-6 text-[10px] px-2"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
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
          generateImage();
        }}
        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background"
      >
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  );
};

export default SignLanguageImage;
