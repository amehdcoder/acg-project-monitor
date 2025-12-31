import { useEffect, useState } from "react";
import acgFlashscreen from "@/assets/acg-flashscreen.png";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(onComplete, 500);
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <img
        src={acgFlashscreen}
        alt="ACG Splash Screen"
        className="h-full w-full object-cover"
      />
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-acg-gold" style={{ animationDelay: "0ms" }} />
          <div className="h-2 w-2 animate-pulse rounded-full bg-acg-gold" style={{ animationDelay: "200ms" }} />
          <div className="h-2 w-2 animate-pulse rounded-full bg-acg-gold" style={{ animationDelay: "400ms" }} />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
