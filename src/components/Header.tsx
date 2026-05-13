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
import AppUpdateButton from "@/components/AppUpdateButton";

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
          <div className="sticky top-0 z-50 flex items-center justify-between bg-accent px-4 py-1.5 text-accent-foreground">
            <div className="flex items-center gap-2 text-xs font-medium">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>
                Viewing as <strong>{impersonatedUserName || profile?.first_name}</strong>
                {originalAdminEmail && (
                  <span className="ml-1 opacity-70">(admin: {originalAdminEmail})</span>
                )}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2 border-accent-foreground/30"
              onClick={stopImpersonation}
            >
              Switch Back
            </Button>
          </div>
        )}

        <header className="sticky top-0 z-40 border-b border-border bg-card/98 backdrop-blur-md supports-[backdrop-filter]:bg-card/90" style={isImpersonating ? { top: 0 } : undefined}>
          <div className="flex h-12 sm:h-14 items-center justify-between px-3 sm:px-4">
            <div className="flex items-center gap-2.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={onMenuClick}
                aria-label="Open navigation menu"
                className="lg:hidden h-9 w-9"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2.5">
                <img
                  src={acgLogo}
                  alt="Amehnities Consulting Group Logo"
                  className="h-8 w-8 rounded-lg ring-1 ring-border"
                />
                <div className="hidden sm:block">
                  <div className="text-sm font-semibold text-foreground leading-tight">
                    Amehnities
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Monitoring & Supervision Platform
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <AppUpdateButton />
              <div className="hidden sm:flex">
                <LanguageSwitcher />
              </div>
              <OfflineSyncIndicator />
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    className="h-8 w-8"
                  >
                    <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Toggle theme</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
              </Tooltip>

              <NotificationsPanel />
              
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className="hidden sm:flex h-8 w-8">
                <Settings className="h-4 w-4" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      isImpersonating ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"
                    }`}>
                      {getInitials()}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium text-foreground">
                      {profile?.first_name} {profile?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{profile?.email}</p>
                    {isImpersonating && (
                      <p className="text-[11px] text-accent mt-0.5 font-medium">Impersonation active</p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  {isImpersonating && (
                    <>
                      <DropdownMenuItem onClick={stopImpersonation} className="text-accent">
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

        <UserProfileDialog open={showProfile} onOpenChange={setShowProfile} />
        <AppSettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      </>
    </TooltipProvider>
  );
};

export default Header;
