import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";

const ASL_ALPHABET: { letter: string; handShape: string; description: string }[] = [
  { letter: "A", handShape: "✊", description: "Fist with thumb on side" },
  { letter: "B", handShape: "🖐️", description: "Flat hand, fingers together, thumb across palm" },
  { letter: "C", handShape: "🤏", description: "Curved hand forming C shape" },
  { letter: "D", handShape: "☝️", description: "Index up, other fingers touch thumb" },
  { letter: "E", handShape: "🤌", description: "Fingers curled down, thumb tucked" },
  { letter: "F", handShape: "👌", description: "Index and thumb form circle, others extended" },
  { letter: "G", handShape: "👉", description: "Index and thumb point sideways" },
  { letter: "H", handShape: "🤞", description: "Index and middle extended sideways" },
  { letter: "I", handShape: "🤙", description: "Pinky extended, fist closed" },
  { letter: "J", handShape: "🤙", description: "Like I, trace J in air with pinky" },
  { letter: "K", handShape: "✌️", description: "Index and middle up, thumb between" },
  { letter: "L", handShape: "🤟", description: "L-shape: thumb and index extended" },
  { letter: "M", handShape: "✊", description: "Three fingers over thumb in fist" },
  { letter: "N", handShape: "✊", description: "Two fingers over thumb in fist" },
  { letter: "O", handShape: "🫰", description: "All fingers curved to touch thumb" },
  { letter: "P", handShape: "👇", description: "Like K but pointing down" },
  { letter: "Q", handShape: "👇", description: "Like G but pointing down" },
  { letter: "R", handShape: "🤞", description: "Index and middle crossed" },
  { letter: "S", handShape: "✊", description: "Fist with thumb over fingers" },
  { letter: "T", handShape: "✊", description: "Thumb between index and middle" },
  { letter: "U", handShape: "✌️", description: "Index and middle together, pointing up" },
  { letter: "V", handShape: "✌️", description: "Index and middle spread apart" },
  { letter: "W", handShape: "🤟", description: "Three fingers spread apart" },
  { letter: "X", handShape: "☝️", description: "Index finger hooked/bent" },
  { letter: "Y", handShape: "🤙", description: "Thumb and pinky extended" },
  { letter: "Z", handShape: "☝️", description: "Index finger traces Z in air" },
];

const NUMBER_SIGNS = [
  { num: "0", hand: "👌", desc: "O shape" },
  { num: "1", hand: "☝️", desc: "Index finger up" },
  { num: "2", hand: "✌️", desc: "Peace sign / two fingers" },
  { num: "3", hand: "🤟", desc: "Three fingers spread" },
  { num: "4", hand: "🖐️", desc: "Four fingers, thumb in" },
  { num: "5", hand: "🖐️", desc: "All five fingers spread" },
  { num: "6", hand: "🤙", desc: "Pinky and thumb touch" },
  { num: "7", hand: "🤞", desc: "Ring finger and thumb touch" },
  { num: "8", hand: "🤏", desc: "Middle finger and thumb touch" },
  { num: "9", hand: "👌", desc: "Index and thumb touch, curl" },
  { num: "10", hand: "👍", desc: "Thumb up, shake" },
];

interface FingerspellingChartProps {
  signLanguage: string;
}

const FingerspellingChart = ({ signLanguage }: FingerspellingChartProps) => {
  const speak = (text: string) => {
    // Route through unified TTS service: handles voice prewarm, Chrome cancel
    // race, locale fallback chain, and >15s utterance keep-alive.
    void tts.speak(text, { rate: 0.7 });
  };

  return (
    <div className="space-y-4">
      {/* Alphabet */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            🔤 Fingerspelling Alphabet
            <Badge variant="outline" className="text-[10px]">ASL Standard</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Use fingerspelling to spell out names, places, or unfamiliar words letter by letter.
            Show each letter clearly and pause briefly between letters.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-2">
            {ASL_ALPHABET.map(({ letter, handShape, description }) => (
              <button
                key={letter}
                onClick={() => speak(`${letter}. ${description}`)}
                className="flex flex-col items-center p-2 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                title={description}
              >
                <span className="text-2xl mb-0.5">{handShape}</span>
                <span className="text-sm font-bold text-foreground">{letter}</span>
                <span className="text-[9px] text-muted-foreground leading-tight text-center hidden group-hover:block mt-0.5">{description}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Numbers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            🔢 Number Signs (0–10)
            <Badge variant="outline" className="text-[10px]">Essential</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Numbers are critical for health surveys — age, household size, doses taken, etc.
            For numbers above 10, combine signs (e.g., 1+5 for 15).
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {NUMBER_SIGNS.map(({ num, hand, desc }) => (
              <button
                key={num}
                onClick={() => speak(`Number ${num}. ${desc}`)}
                className="flex flex-col items-center p-3 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all"
                title={desc}
              >
                <span className="text-3xl mb-1">{hand}</span>
                <span className="text-lg font-bold text-foreground">{num}</span>
                <span className="text-[10px] text-muted-foreground text-center">{desc}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="bg-accent/30 border-accent/50">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">📌 Fingerspelling Tips for Field Workers</h3>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
            <li>Hold your hand steady at shoulder height, palm facing the person</li>
            <li>Spell slowly — pause between each letter for clarity</li>
            <li>For names, spell once slowly, then again at normal speed</li>
            <li>If the person doesn't understand, try writing on paper or phone screen</li>
            <li>Numbers above 10: show the tens digit first, then the ones digit</li>
            <li>For large numbers, you may write them down and point</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default FingerspellingChart;
