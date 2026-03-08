import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Language, t as translate } from "@/lib/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("acg-language");
    return (saved as Language) || "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("acg-language", lang);
  };

  const tFn = (key: string) => translate(key as any, language);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: tFn }}>
      {children}
    </LanguageContext.Provider>
  );
};
