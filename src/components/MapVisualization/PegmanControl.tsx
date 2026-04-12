import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface PegmanControlProps {
  onActivate: () => void;
  isActive: boolean;
  position?: "topright" | "bottomright";
}

const PegmanControl = ({ onActivate, isActive, position = "bottomright" }: PegmanControlProps) => {
  const posClass = position === "topright" 
    ? "top-4 right-4" 
    : "bottom-24 right-3";

  return (
    <button
      onClick={() => {
        onActivate();
        if (!isActive) {
          toast({
            title: "Street View Mode",
            description: "Click any location on the map to open Street View.",
          });
        }
      }}
      className={`absolute ${posClass} z-[1000] w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all ${
        isActive
          ? "bg-yellow-400 ring-2 ring-yellow-500 scale-110"
          : "bg-white dark:bg-card hover:bg-muted"
      }`}
      title={isActive ? "Exit Street View mode" : "Enter Street View mode (Pegman)"}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="6" r="3" fill={isActive ? "#333" : "#FBBC05"} />
        <path
          d="M12 10c-3 0-5 1.5-5 3.5V16h10v-2.5c0-2-2-3.5-5-3.5z"
          fill={isActive ? "#333" : "#FBBC05"}
        />
        <rect x="10" y="16" width="4" height="4" rx="1" fill={isActive ? "#333" : "#FBBC05"} />
      </svg>
    </button>
  );
};

export default PegmanControl;
