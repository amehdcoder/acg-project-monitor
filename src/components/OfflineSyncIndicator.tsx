import { useState } from "react";
import {
  Wifi,
  WifiOff,
  CloudOff,
  RefreshCw,
  Check,
  AlertTriangle,
  ChevronDown,
  Satellite,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import SatelliteSyncDialog from "@/components/SatelliteSyncDialog";

const OfflineSyncIndicator = () => {
  const { isOnline, pendingCount, isSyncing, syncPendingSubmissions, getPending, updatePendingCount } = useOfflineStorage();
  const [isOpen, setIsOpen] = useState(false);
  const [satOpen, setSatOpen] = useState(false);
  const [pendingForSat, setPendingForSat] = useState<any[]>([]);

  const handleSync = async () => {
    await syncPendingSubmissions();
  };

  const handleSatelliteSync = async () => {
    const pending = await getPending();
    setPendingForSat(pending);
    setIsOpen(false);
    setSatOpen(true);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`relative gap-2 ${
            !isOnline ? "text-destructive" : pendingCount > 0 ? "text-acg-gold" : "text-green-500"
          }`}
        >
          {!isOnline ? (
            <WifiOff className="h-4 w-4" />
          ) : pendingCount > 0 ? (
            <CloudOff className="h-4 w-4" />
          ) : (
            <Wifi className="h-4 w-4" />
          )}
          
          {pendingCount > 0 && (
            <Badge 
              variant="secondary" 
              className="h-5 min-w-[20px] rounded-full bg-acg-gold px-1.5 text-[10px] font-bold text-white"
            >
              {pendingCount}
            </Badge>
          )}
          
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent align="end" className="w-72">
        <div className="space-y-4">
          {/* Status Header */}
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                !isOnline
                  ? "bg-destructive/10"
                  : pendingCount > 0
                  ? "bg-acg-gold/10"
                  : "bg-green-500/10"
              }`}
            >
              {!isOnline ? (
                <WifiOff className="h-5 w-5 text-destructive" />
              ) : pendingCount > 0 ? (
                <CloudOff className="h-5 w-5 text-acg-gold" />
              ) : (
                <Check className="h-5 w-5 text-green-500" />
              )}
            </div>
            <div>
              <p className="font-medium text-foreground">
                {!isOnline
                  ? "You're Offline"
                  : pendingCount > 0
                  ? "Pending Sync"
                  : "All Synced"}
              </p>
              <p className="text-sm text-muted-foreground">
                {!isOnline
                  ? "Data will sync when online"
                  : pendingCount > 0
                  ? `${pendingCount} submission${pendingCount > 1 ? "s" : ""} waiting`
                  : "Everything is up to date"}
              </p>
            </div>
          </div>

          {/* Pending Items Info */}
          {pendingCount > 0 && (
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-acg-gold" />
                <p className="text-xs text-muted-foreground">
                  {isOnline
                    ? "Click sync to upload pending submissions now."
                    : "Submissions are saved locally and will automatically sync when you're back online."}
                </p>
              </div>
            </div>
          )}

          {/* Sync Button */}
          {isOnline && pendingCount > 0 && (
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full"
              variant="acg"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync Now
                </>
              )}
            </Button>
          )}

          {/* Satellite Sync Button - available whenever there are pending items */}
          {pendingCount > 0 && (
            <Button
              onClick={handleSatelliteSync}
              variant="outline"
              className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
            >
              <Satellite className="h-4 w-4" />
              Satellite Sync (Low-Bandwidth)
            </Button>
          )}

          {/* Offline Mode Info */}
          {!isOnline && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs text-destructive">
                <strong>Offline Mode Active</strong>
                <br />
                You can continue filling forms. Use Satellite Sync to transmit tiny packets
                even with no cell towers.
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>

    <SatelliteSyncDialog
      open={satOpen}
      onOpenChange={setSatOpen}
      pendingSubmissions={pendingForSat}
      onSyncComplete={() => updatePendingCount()}
    />
    </>
  );
};

export default OfflineSyncIndicator;
