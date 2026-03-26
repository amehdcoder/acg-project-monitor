import { useState } from "react";
import { Menu, User, Settings, LogOut, Moon, Sun, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { toast } from "@/hooks/use-toast";
import acgLogo from "@/assets/acg-logo.png";
import OfflineSyncIndicator from "@/components/OfflineSyncIndicator";
import NotificationsPanel from "@/components/NotificationsPanel";
import UserProfileDialog from "@/components/UserProfileDialog";
import AppSettingsDialog from "@/components/AppSettingsDialog";
import LanguageSwitcher from "@/components/LanguageSwitcher";

interface Profile {
  first_name: string;
  last_name: string;
  email: string;
}

interface HeaderProps {
  onMenuClick: () => void;
  profile?: Profile | null;
}

const Header = ({ onMenuClick, profile }: HeaderProps) => {
  const { signOut } = useAuth();
  const { isImpersonating, originalAdminEmail, impersonatedUserName, stopImpersonation } = useImpersonation();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast({ title: "Signed out", description: "You have been logged out successfully." });
    navigate("/auth");
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return "U";
  };

  return (
    <TooltipProvider>
      <>
        {/* Impersonation Banner */}
        {isImpersonating && (
          <div className="sticky top-0 z-50 flex items-center justify-between bg-amber-500 px-4 py-2 text-amber-950">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArrowLeftRight className="h-4 w-4" />
              <span>
                Viewing as <strong>{impersonatedUserName || profile?.first_name}</strong>
                {originalAdminEmail && (
                  <span className="ml-1 opacity-80">
                    (admin: {originalAdminEmail})
                  </span>
                )}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-700 bg-amber-600 text-amber-950 hover:bg-amber-700 h-7 text-xs"
              onClick={stopImpersonation}
            >
              Switch Back to Admin
            </Button>
          </div>
        )}

        <header className="sticky top-0 z-40 border-b border-border/60 bg-card/95 backdrop-blur-lg supports-[backdrop-filter]:bg-card/80 shadow-sm" style={isImpersonating ? { top: 0 } : undefined}>
          <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onMenuClick}
                className="lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <img
                  src={acgLogo}
                  alt="ACG Logo"
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-full shadow-soft ring-2 ring-primary/10"
                />
                <div className="hidden sm:block">
                  <h1 className="font-display text-lg font-semibold text-foreground">
                    Amehnities Consulting Group (ACG)
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Monitoring & Supervision Platform
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <div className="hidden sm:flex">
                <LanguageSwitcher />
              </div>
              <OfflineSyncIndicator />
              
              {/* Dark Mode Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="relative h-9 w-9 sm:h-10 sm:w-10"
              >
                <Sun className="h-4 w-4 sm:h-5 sm:w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 sm:h-5 sm:w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>

              <NotificationsPanel />
              
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className="hidden sm:flex h-9 w-9 sm:h-10 sm:w-10">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                      isImpersonating ? "bg-amber-500 text-amber-950" : "bg-primary text-primary-foreground"
                    }`}>
                      {getInitials()}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="font-medium text-foreground">
                      {profile?.first_name} {profile?.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">{profile?.email}</p>
                    {isImpersonating && (
                      <p className="text-xs text-amber-600 mt-1 font-medium">Impersonation active</p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  {isImpersonating && (
                    <>
                      <DropdownMenuItem onClick={stopImpersonation} className="text-amber-600">
                        <ArrowLeftRight className="mr-2 h-4 w-4" />
                        Switch Back to Admin
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={() => setShowProfile(true)}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Profile Dialog */}
        <UserProfileDialog open={showProfile} onOpenChange={setShowProfile} />

        {/* Settings Dialog */}
        <AppSettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      </>
    </TooltipProvider>
  );
};

export default Header;
