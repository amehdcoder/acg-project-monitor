import { useState } from "react";
import { Menu, User, Settings, LogOut, Moon, Sun } from "lucide-react";
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
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast({ title: "Signed out", description: "You have been logged out successfully." });
    navigate("/auth");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
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
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex h-16 items-center justify-between px-4">
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
                  className="h-10 w-10 rounded-full shadow-soft"
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

            <div className="flex items-center gap-2">
              <OfflineSyncIndicator />
              
              {/* Dark Mode Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    className="relative"
                  >
                    <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Toggle theme</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Toggle {theme === "dark" ? "light" : "dark"} mode</p>
                </TooltipContent>
              </Tooltip>

              <NotificationsPanel />
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
                    <Settings className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Settings</p>
                </TooltipContent>
              </Tooltip>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
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
                  </div>
                  <DropdownMenuSeparator />
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
