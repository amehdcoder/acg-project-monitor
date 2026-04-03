import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HandMetal, Search, Globe, BookOpen, Users, MessageSquare } from "lucide-react";

const LANGUAGES = [
  { id: "asl", name: "American Sign Language (ASL)", flag: "🇺🇸" },
  { id: "nsl", name: "Nigerian Sign Language (NSL)", flag: "🇳🇬" },
  { id: "hausa", name: "Hausa Sign Language", flag: "🇳🇬" },
  { id: "yoruba", name: "Yoruba Sign Language", flag: "🇳🇬" },
  { id: "igbo", name: "Igbo Sign Language", flag: "🇳🇬" },
  { id: "idoma", name: "Idoma Sign Language", flag: "🇳🇬" },
  { id: "nupe", name: "Nupe Sign Language", flag: "🇳🇬" },
  { id: "gbagyi", name: "Gbagyi Sign Language", flag: "🇳🇬" },
  { id: "tiv", name: "Tiv Sign Language", flag: "🇳🇬" },
];

// Common data collection phrases with sign language descriptions
const SIGN_CATEGORIES = [
  {
    id: "greetings",
    name: "Greetings & Introduction",
    icon: Users,
    phrases: [
      { phrase: "Hello, my name is...", description: "Wave hand, then point to self and fingerspell name", signs: { asl: "Wave + point to self + fingerspell", nsl: "Open palm wave + chest tap + fingerspell", hausa: "Right hand to forehead salute + chest point", yoruba: "Both palms open forward + chest touch", igbo: "Right hand wave + point to chest", idoma: "Open hand raise + touch chest", nupe: "Palm outward wave + self-point gesture", gbagyi: "Head nod + hand to chest", tiv: "Right hand raise + chest tap" } },
      { phrase: "How are you?", description: "Thumbs up, questioning expression", signs: { asl: "Both fists thumbs up, move alternately + raised eyebrows", nsl: "Open palm circle on chest + questioning face", hausa: "Right palm on heart + eyebrows raised", yoruba: "Both hands flat, palms up + head tilt", igbo: "Hand wave + questioning expression", idoma: "Palm to chest, circle + ask face", nupe: "Thumbs up + head tilt question", gbagyi: "Hand to chest + questioning nod", tiv: "Open palms out + raised brows" } },
      { phrase: "I am a health worker", description: "Point to self, cross arms on chest (health), working gesture", signs: { asl: "Point self + cross wrists on chest + miming working", nsl: "Self-point + red cross sign on arm + clipboard mime", hausa: "Chest point + cross arms (medicine) + writing motion", yoruba: "Self-tap + heart area cross + noting gesture", igbo: "Point chest + arms crossed health + work mime", idoma: "Self-point + medical cross + writing", nupe: "Chest touch + cross sign + clipboard", gbagyi: "Self-indicate + health cross + activity mime", tiv: "Point self + cross on chest + work gesture" } },
    ],
  },
  {
    id: "consent",
    name: "Consent & Permission",
    icon: MessageSquare,
    phrases: [
      { phrase: "May I ask you some questions?", description: "Point to self, mime talking, questioning look", signs: { asl: "Self-point + index finger from lips + raised eyebrows", nsl: "Self-point + talking gesture + palms up question", hausa: "Self-point + mouth gesture + permission nod", yoruba: "Chest touch + speaking mime + open palms up", igbo: "Self-point + lip gesture + questioning", idoma: "Point self + talking + palms up", nupe: "Self-indicate + mouth move + ask gesture", gbagyi: "Self-point + talk mime + head question", tiv: "Self-point + lips motion + open palms" } },
      { phrase: "You can say no at any time", description: "Point to person, head shake (no), clock gesture (time)", signs: { asl: "Point to other + head shake + wrist tap (time)", nsl: "Point other + X hand (no) + clock circle", hausa: "Point to person + hand wave no + time circle", yoruba: "Person point + cross hands + wrist watch", igbo: "Point other + shake head + time gesture", idoma: "Point + no gesture + clock mime", nupe: "Indicate person + refusal sign + time", gbagyi: "Point + head shake + wrist circle", tiv: "Point out + refuse gesture + time sign" } },
      { phrase: "Your information is confidential", description: "Point to person, lock gesture, secret sign", signs: { asl: "Point + fist twist (lock) + finger over lips (secret)", nsl: "Point other + key turning + lips sealed", hausa: "Person point + lock twist + silence gesture", yoruba: "Point + key turn + lips zip", igbo: "Point other + lock sign + quiet mouth", idoma: "Indicate + lock gesture + sealed lips", nupe: "Point + turn key + finger on lips", gbagyi: "Point other + lock + quiet sign", tiv: "Point + lock twist + lips sealed" } },
    ],
  },
  {
    id: "health",
    name: "Health Questions",
    icon: BookOpen,
    phrases: [
      { phrase: "Do you have any swelling?", description: "Mime swelling with both hands expanding", signs: { asl: "Both C-hands expanding outward from body + question face", nsl: "Hands cupped expanding + raised brows", hausa: "Hands around area + expanding + question", yoruba: "Cup hands + expand outward + ask face", igbo: "Both hands expand from point + question", idoma: "Hands enlarge gesture + questioning look", nupe: "Expanding hand gesture + question face", gbagyi: "Hands swell mime + raised eyebrows", tiv: "Expanding cupped hands + question" } },
      { phrase: "Can you see clearly?", description: "Point to eyes, then far away, questioning", signs: { asl: "V-hand from eyes outward + thumbs up/down + question", nsl: "Point eyes + look far + question gesture", hausa: "Eye point + far gaze + ask expression", yoruba: "Touch eyes + distant look + question nod", igbo: "Eyes point + see far + questioning", idoma: "Eye gesture + distance look + ask", nupe: "Point eyes + far point + question", gbagyi: "Eyes indicate + far look + raised brows", tiv: "Eye point + gaze far + question face" } },
      { phrase: "Where does it hurt?", description: "Grimace face, point questioning gesture around body", signs: { asl: "Both index fingers touch + grimace + sweep hand across body + question", nsl: "Pain face + hand sweep body + point where + question", hausa: "Pain expression + body sweep + where gesture", yoruba: "Grimace + indicate body areas + question", igbo: "Pain face + body point + where question", idoma: "Hurt expression + body sweep + ask where", nupe: "Pain sign + body indicate + question", gbagyi: "Grimace + body area point + where sign", tiv: "Pain face + body sweep + question where" } },
      { phrase: "How long have you had this condition?", description: "Point to condition, clock/calendar gesture, how many", signs: { asl: "Point to area + wrist tap + how-many fingers", nsl: "Indicate condition + time circle + counting question", hausa: "Point area + calendar page + how many", yoruba: "Condition point + clock circle + number question", igbo: "Point + time gesture + count question", idoma: "Indicate + time sign + quantity ask", nupe: "Point + clock mime + how many", gbagyi: "Condition point + time + count question", tiv: "Point + time circle + number question" } },
      { phrase: "Have you taken any medicine?", description: "Mime taking pills, swallowing", signs: { asl: "Pinch fingers to mouth (pill) + swallow + question", nsl: "Medicine cup mime + swallow + question face", hausa: "Pill to mouth + swallow + ask", yoruba: "Medicine gesture + drink/swallow + question", igbo: "Pill mime + swallow + question expression", idoma: "Medicine take + swallow + ask", nupe: "Pill gesture + mouth + question", gbagyi: "Medicine mime + take in + question face", tiv: "Pill to mouth + swallow + question" } },
    ],
  },
  {
    id: "numbers",
    name: "Numbers & Counting",
    icon: BookOpen,
    phrases: [
      { phrase: "Numbers 1-10", description: "Standard finger counting", signs: { asl: "1: index up, 2: index+middle, 3: +ring, 4: +pinky, 5: open hand, 6-10: opposite hand", nsl: "Same as ASL with slight local variations", hausa: "Right hand fingers extend sequentially 1-5, left hand 6-10", yoruba: "Sequential finger raising, both hands", igbo: "Fingers extend one by one, two-hand system", idoma: "Sequential finger count system", nupe: "Right hand first, then left hand for 6-10", gbagyi: "One-hand then two-hand counting", tiv: "Sequential finger extension system" } },
      { phrase: "Yes", description: "Nod head, fist nod", signs: { asl: "S-hand nods (like head nodding)", nsl: "Head nod + thumbs up", hausa: "Head nod with right palm up", yoruba: "Double head nod", igbo: "Firm single head nod", idoma: "Head nod + open palm", nupe: "Nodding head gesture", gbagyi: "Head nod with smile", tiv: "Firm head nod" } },
      { phrase: "No", description: "Head shake, index finger wave", signs: { asl: "Index+middle finger snap to thumb", nsl: "Head shake + hand wave", hausa: "Right index finger wave side to side", yoruba: "Head shake + crossed hands", igbo: "Head shake + waving finger", idoma: "Side head shake + hand cross", nupe: "Finger wag + head shake", gbagyi: "Head shake + palm down", tiv: "Head shake + finger wag" } },
    ],
  },
];

const SignLanguageView = () => {
  const [selectedLanguage, setSelectedLanguage] = useState("nsl");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("greetings");

  const filteredPhrases = SIGN_CATEGORIES.find(c => c.id === activeCategory)?.phrases.filter(p =>
    p.phrase.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const currentLang = LANGUAGES.find(l => l.id === selectedLanguage)!;

  return (
    <div className="space-y-4 p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-primary/10">
          <HandMetal className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Sign Language Guide</h1>
          <p className="text-sm text-muted-foreground">Learn to ask form questions using sign language for inclusive data collection</p>
        </div>
      </div>

      {/* Language Selector */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.flag} {l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search phrases..."
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs">{currentLang.flag} {currentLang.name}</Badge>
        <Badge variant="secondary" className="text-xs">{filteredPhrases.length} phrases</Badge>
      </div>

      {/* Categories */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50">
          {SIGN_CATEGORIES.map(c => (
            <TabsTrigger key={c.id} value={c.id} className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <c.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{c.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Phrases */}
      <ScrollArea className="h-[calc(100vh-380px)]">
        <div className="space-y-3 pr-2">
          {filteredPhrases.map((phrase, idx) => (
            <Card key={idx} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Visual sign representation */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <HandMetal className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm sm:text-base">"{phrase.phrase}"</p>
                    <p className="text-xs text-muted-foreground mt-1">{phrase.description}</p>
                    <div className="mt-2 p-2 rounded-lg bg-muted/50 border border-border">
                      <p className="text-xs font-medium text-primary mb-0.5">{currentLang.flag} {currentLang.name}:</p>
                      <p className="text-sm text-foreground">{(phrase.signs as any)[selectedLanguage] || "Translation pending"}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredPhrases.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <HandMetal className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No phrases found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SignLanguageView;
