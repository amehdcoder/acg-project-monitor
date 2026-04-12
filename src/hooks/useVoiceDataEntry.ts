import { useState, useCallback, useRef, useEffect } from "react";

interface VoiceDataEntryOptions {
  language?: string;
  continuous?: boolean;
  onResult?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

export const useVoiceDataEntry = (options: VoiceDataEntryOptions = {}) => {
  const [isListening, setIsListening] = useState(false);
  const [isEnabled, setIsEnabled] = useState(() => {
    const stored = localStorage.getItem("voice_data_entry_enabled");
    return stored === "true";
  });
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  const toggleEnabled = useCallback((value: boolean) => {
    setIsEnabled(value);
    localStorage.setItem("voice_data_entry_enabled", String(value));
    if (!value && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isEnabled || !isSupported) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = options.continuous ?? true;
    recognition.interimResults = true;
    recognition.lang = options.language || "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        setTranscript((prev) => prev + (prev ? " " : "") + final.trim());
        options.onResult?.(final.trim(), true);
      }
      setInterimTranscript(interim);
      if (interim) {
        options.onResult?.(interim, false);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") return; // Ignore no-speech
      console.error("Speech recognition error:", event.error);
      options.onError?.(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [isEnabled, isSupported, options.language, options.continuous]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isListening,
    isEnabled,
    isSupported,
    transcript,
    interimTranscript,
    toggleEnabled,
    startListening,
    stopListening,
    clearTranscript,
  };
};

export default useVoiceDataEntry;
