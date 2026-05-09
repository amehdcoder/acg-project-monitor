import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";

interface BatteryStatus {
  level: number;
  charging: boolean;
}

export const useFieldOptimization = () => {
  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus | null>(null);
  const [isLowBatteryMode, setIsLowBatteryMode] = useState(false);
  const [highContrastMode, setHighContrastMode] = useState(() => {
    return localStorage.getItem("field_high_contrast") === "true";
  });

  useEffect(() => {
    // Monitor Battery Status if supported
    if ("getBattery" in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBattery = () => {
          const status = { level: battery.level, charging: battery.charging };
          setBatteryStatus(status);
          
          if (battery.level < 0.20 && !battery.charging) {
            if (!isLowBatteryMode) {
              setIsLowBatteryMode(true);
              toast({
                title: "Low Battery Optimization",
                description: "Battery below 20%. Reducing background sync and animations to conserve energy.",
                variant: "destructive"
              });
            }
          } else {
            setIsLowBatteryMode(false);
          }
        };

        updateBattery();
        battery.addEventListener("levelchange", updateBattery);
        battery.addEventListener("chargingchange", updateBattery);

        return () => {
          battery.removeEventListener("levelchange", updateBattery);
          battery.removeEventListener("chargingchange", updateBattery);
        };
      });
    }
  }, [isLowBatteryMode]);

  useEffect(() => {
    // Apply high contrast styles to body
    if (highContrastMode) {
      document.body.classList.add("field-high-contrast");
      localStorage.setItem("field_high_contrast", "true");
    } else {
      document.body.classList.remove("field-high-contrast");
      localStorage.setItem("field_high_contrast", "false");
    }
  }, [highContrastMode]);

  const toggleHighContrast = () => setHighContrastMode(prev => !prev);

  return {
    batteryStatus,
    isLowBatteryMode,
    highContrastMode,
    toggleHighContrast,
  };
};
