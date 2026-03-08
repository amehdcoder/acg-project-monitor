import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/useLanguage";
import { LANGUAGE_LABELS, LANGUAGE_FLAGS, Language } from "@/lib/i18n";

const LANGUAGES: Language[] = ["en", "ha", "yo", "ig"];

const LanguageSwitcher = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Globe className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">
                  {LANGUAGE_FLAGS[language]}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={language === lang ? "bg-primary/10 font-medium" : ""}
                >
                  <span className="mr-2">{LANGUAGE_FLAGS[lang]}</span>
                  {LANGUAGE_LABELS[lang]}
                  {language === lang && (
                    <span className="ml-auto text-primary">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Language: {LANGUAGE_LABELS[language]}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default LanguageSwitcher;
