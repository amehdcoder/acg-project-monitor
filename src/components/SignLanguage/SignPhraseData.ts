import { Users, MessageSquare, FileText, Heart, AlertTriangle, Clock, Stethoscope } from "lucide-react";

export interface SignPhrase {
  phrase: string;
  description: string;
  signs: Record<string, string>;
}

export interface SignCategory {
  id: string;
  name: string;
  icon: React.ElementType;
  phrases: SignPhrase[];
}

export const LANGUAGES = [
  { id: "asl", name: "American Sign Language (ASL)", flag: "🇺🇸" },
  { id: "bsl", name: "British Sign Language (BSL)", flag: "🇬🇧" },
  { id: "isl", name: "International Sign Language", flag: "🌍" },
  { id: "nsl", name: "Nigerian Sign Language (NSL)", flag: "🇳🇬" },
  { id: "hausa", name: "Hausa Sign Language", flag: "🇳🇬" },
  { id: "yoruba", name: "Yoruba Sign Language", flag: "🇳🇬" },
  { id: "igbo", name: "Igbo Sign Language", flag: "🇳🇬" },
  { id: "idoma", name: "Idoma Sign Language", flag: "🇳🇬" },
  { id: "nupe", name: "Nupe Sign Language", flag: "🇳🇬" },
  { id: "gbagyi", name: "Gbagyi Sign Language", flag: "🇳🇬" },
  { id: "tiv", name: "Tiv Sign Language", flag: "🇳🇬" },
];

const allSigns = (asl: string, bsl: string, isl: string, nsl: string) => ({
  asl, bsl, isl, nsl,
  hausa: nsl, yoruba: nsl, igbo: nsl, idoma: nsl, nupe: nsl, gbagyi: nsl, tiv: nsl,
});

export const ESSENTIAL_PHRASES: SignCategory[] = [
  {
    id: "greetings",
    name: "Greetings & Introduction",
    icon: Users,
    phrases: [
      { phrase: "Hello, my name is...", description: "Wave hand, then point to self and fingerspell name", signs: { asl: "Wave + point to self + fingerspell", bsl: "Open hand wave + point to self + fingerspell", isl: "Wave with open palm + self-point + fingerspell", nsl: "Open palm wave + chest tap + fingerspell", hausa: "Right hand to forehead salute + chest point", yoruba: "Both palms open forward + chest touch", igbo: "Right hand wave + point to chest", idoma: "Open hand raise + touch chest", nupe: "Palm outward wave + self-point gesture", gbagyi: "Head nod + hand to chest", tiv: "Right hand raise + chest tap" } },
      { phrase: "How are you?", description: "Thumbs up, questioning expression", signs: { asl: "Both fists thumbs up, move alternately + raised eyebrows", bsl: "Thumbs up + questioning face", isl: "Both thumbs up alternating + raised brows", nsl: "Open palm circle on chest + questioning face", hausa: "Right palm on heart + eyebrows raised", yoruba: "Both hands flat, palms up + head tilt", igbo: "Hand wave + questioning expression", idoma: "Palm to chest, circle + ask face", nupe: "Thumbs up + head tilt question", gbagyi: "Hand to chest + questioning nod", tiv: "Open palms out + raised brows" } },
      { phrase: "I am a health worker", description: "Point to self, cross arms on chest (health), working gesture", signs: { asl: "Point self + cross wrists on chest + miming working", bsl: "Self-point + cross on upper arm + work gesture", isl: "Self-indicate + red cross sign + clipboard mime", nsl: "Self-point + red cross sign on arm + clipboard mime", hausa: "Chest point + cross arms (medicine) + writing motion", yoruba: "Self-tap + heart area cross + noting gesture", igbo: "Point chest + arms crossed health + work mime", idoma: "Self-point + medical cross + writing", nupe: "Chest touch + cross sign + clipboard", gbagyi: "Self-indicate + health cross + activity mime", tiv: "Point self + cross on chest + work gesture" } },
      { phrase: "I am here to help you", description: "Point to self, point here, helping hands gesture", signs: allSigns("Self-point + point down (here) + clasped helping hands", "Self-point + here gesture + supportive hands", "Self-indicate + location point + helping hands forward", "Self-point + ground point + open palms offering") },
      { phrase: "Thank you for your time", description: "Flat hand from chin forward, clock gesture", signs: { asl: "Flat hand from chin forward + wrist tap", bsl: "Hand from chin + wrist tap", isl: "Both palms forward from face + time circle", nsl: "Hand from lips forward + clock circle", hausa: "Hand from mouth bow + time circle", yoruba: "Both palms forward + wrist gesture", igbo: "Hand forward from chin + time sign", idoma: "Chin to forward + clock mime", nupe: "Gratitude gesture + time sign", gbagyi: "Forward hand + wrist circle", tiv: "Chin forward + time gesture" } },
      { phrase: "Goodbye, take care", description: "Waving goodbye + protective gesture", signs: allSigns("Wave goodbye + both hands cradling motion", "Wave + protective hands gesture", "Open palm wave away + careful hands", "Wave goodbye + palms down safe gesture") },
    ],
  },
  {
    id: "consent",
    name: "Consent & Permission",
    icon: MessageSquare,
    phrases: [
      { phrase: "May I ask you some questions?", description: "Point to self, mime talking, questioning look", signs: { asl: "Self-point + index finger from lips + raised eyebrows", bsl: "Self-point + talking gesture + question face", isl: "Self-indicate + speech gesture + palms up question", nsl: "Self-point + talking gesture + palms up question", hausa: "Self-point + mouth gesture + permission nod", yoruba: "Chest touch + speaking mime + open palms up", igbo: "Self-point + lip gesture + questioning", idoma: "Point self + talking + palms up", nupe: "Self-indicate + mouth move + ask gesture", gbagyi: "Self-point + talk mime + head question", tiv: "Self-point + lips motion + open palms" } },
      { phrase: "This is for a health survey", description: "Show clipboard, cross arms (health), survey gesture", signs: allSigns("Clipboard mime + health cross + writing/checking motion", "Paper hold + medical cross + tick gesture", "Document show + health sign + checklist mime", "Clipboard show + cross sign + list gesture") },
      { phrase: "You can say no at any time", description: "Point to person, head shake (no), clock gesture (time)", signs: { asl: "Point to other + head shake + wrist tap (time)", bsl: "Point other + shake head + clock gesture", isl: "Indicate person + X hand (no) + time circle", nsl: "Point other + X hand (no) + clock circle", hausa: "Point to person + hand wave no + time circle", yoruba: "Person point + cross hands + wrist watch", igbo: "Point other + shake head + time gesture", idoma: "Point + no gesture + clock mime", nupe: "Indicate person + refusal sign + time", gbagyi: "Point + head shake + wrist circle", tiv: "Point out + refuse gesture + time sign" } },
      { phrase: "Your information is confidential", description: "Point to person, lock gesture, secret sign", signs: { asl: "Point + fist twist (lock) + finger over lips (secret)", bsl: "Point other + key turn + sealed lips", isl: "Indicate person + lock twist + finger on lips", nsl: "Point other + key turning + lips sealed", hausa: "Person point + lock twist + silence gesture", yoruba: "Point + key turn + lips zip", igbo: "Point other + lock sign + quiet mouth", idoma: "Indicate + lock gesture + sealed lips", nupe: "Point + turn key + finger on lips", gbagyi: "Point other + lock + quiet sign", tiv: "Point + lock twist + lips sealed" } },
      { phrase: "Do you agree to participate?", description: "Handshake gesture + questioning face", signs: allSigns("Clasp hands + thumbs up/down + raised eyebrows", "Handshake + thumbs up/down + raised brows", "Clasped hands + question expression", "Handshake mime + question face") },
      { phrase: "You can stop anytime you want", description: "Point to person, stop hand, anytime gesture", signs: allSigns("Point other + flat palm (stop) + circular time gesture + point to them", "Point + halt hand + clock + person point", "Indicate person + stop palm + time circle + self-choice point", "Point other + stop sign + clock circle + head nod") },
    ],
  },
  {
    id: "health",
    name: "Health & Medical",
    icon: Stethoscope,
    phrases: [
      { phrase: "Do you feel sick?", description: "Point to person, sick gesture (hand on forehead)", signs: allSigns("Point other + open hand on forehead + grimace", "Point + forehead touch (sick) + frown", "Indicate person + sick forehead + pain face", "Point other + sick head touch + unwell face") },
      { phrase: "Where does it hurt?", description: "Questioning face + point to body + pain sign", signs: allSigns("Where (palms up, shake) + pain sign (index fingers twist) + point to body", "Question face + pain twist + body point", "Where gesture + hurt sign + body indicate", "Palms up question + pain fingers + body sweep") },
      { phrase: "How many days have you been sick?", description: "How-many + day + sick signs", signs: allSigns("How-many (open hands, close repeatedly) + day (index on elbow rise) + sick sign", "Count question + day sign + unwell gesture", "Number question + sun rise gesture + sick sign", "How-many hands + day sign + forehead sick") },
      { phrase: "Have you taken any medicine?", description: "Medicine/pill gesture + question", signs: allSigns("Middle finger palm-tap (medicine) + past tense + raised eyebrows", "Pill mime + question face + past sign", "Medicine palm-tap + before + question expression", "Pill/medicine sign + finished + question face") },
      { phrase: "Do you have a fever?", description: "Temperature check forehead gesture", signs: allSigns("Hand on forehead (hot) + thermometer mime + question face", "Forehead touch (warm) + temperature check + question", "Hot forehead + thermometer gesture + raised brows", "Temperature forehead + hot sign + question expression") },
      { phrase: "Can I check your eyes?", description: "Point to self, eye point, question", signs: allSigns("Self-point + point to own eyes + point to their eyes + raised eyebrows", "May I + eye point + check gesture + question", "Self-indicate + eyes sign + examine mime + permission question", "Point self + eye gesture + look-check + question face") },
      { phrase: "Open your mouth please", description: "Mime opening mouth + please gesture", signs: allSigns("Point to mouth + open gesture (hands apart) + please (circular palm on chest)", "Mouth point + open wide gesture + please sign", "Indicate mouth + hands opening gesture + gentle please", "Mouth sign + open hands + please palm circle") },
      { phrase: "Are you pregnant?", description: "Curved hand on belly + question", signs: allSigns("Curved hand moving outward from belly + raised eyebrows", "Belly curve gesture + question face", "Pregnant belly sign + question expression", "Stomach curve out + question face") },
      { phrase: "How old are you?", description: "Age question — chin stroke + question", signs: allSigns("Grab chin (old/age) + question expression + counting gesture", "Age chin sign + how-many + question", "Chin stroke (age) + number question + raised brows", "Age sign chin + count gesture + question face") },
      { phrase: "Do you have any allergies?", description: "Allergy sign + question", signs: allSigns("Index finger to nose + sneeze gesture + raised eyebrows", "Nose rub + reaction mime + question", "Allergy nose sign + body reaction + question face", "Nose touch + itchy/reaction + question expression") },
    ],
  },
  {
    id: "emergency",
    name: "Emergency & Urgent",
    icon: AlertTriangle,
    phrases: [
      { phrase: "This is urgent / emergency", description: "Exclamation gesture + urgency sign", signs: allSigns("Fists shaking (urgent) + exclamation expression + point to situation", "Both fists urgent shake + serious face", "Urgent hand shake + wide eyes + point", "Emergency fists + alert expression + indicate") },
      { phrase: "Do you need help right now?", description: "Help sign + now + question", signs: allSigns("Fist on palm push up (help) + point down (now) + raised eyebrows", "Help sign + now point + question face", "Assist gesture + immediate point + question expression", "Help hand + now sign + question face") },
      { phrase: "We need to go to the hospital", description: "Cross on arm (hospital) + go gesture", signs: allSigns("H-shape cross on upper arm (hospital) + walking fingers + point away", "Medical cross arm + travel gesture + point direction", "Hospital cross sign + go/move gesture + direction point", "Arm cross (hospital) + move fingers + away point") },
      { phrase: "Please stay calm", description: "Both palms down pressing motion (calm)", signs: allSigns("Both palms facing down, pressing gently downward repeatedly + soft expression", "Calm down palms + gentle face", "Palms down press + reassuring expression", "Down pressing hands + calm face + gentle nod") },
      { phrase: "Is anyone else sick?", description: "Others + sick + question", signs: allSigns("Sweep arm (others/anyone) + sick forehead + raised eyebrows", "Group sweep + unwell sign + question", "Others indicate + sick gesture + question face", "Arm sweep (others) + sick sign + question expression") },
    ],
  },
  {
    id: "household",
    name: "Household & Demographics",
    icon: Users,
    phrases: [
      { phrase: "How many people live in this house?", description: "How-many + people + house signs", signs: allSigns("How-many (open/close hands) + people (index circles) + house (triangle roof)", "Count question + people sign + home triangle", "Number question + group sign + house gesture", "How-many + persons circles + roof triangle") },
      { phrase: "Do you have children?", description: "Child sign + question", signs: allSigns("Flat hand patting (child height) + raised eyebrows", "Low pat (children) + question face", "Child height gesture + question expression", "Small height pat + question face") },
      { phrase: "What is your occupation?", description: "Work sign + question", signs: allSigns("Fist hitting fist (work) + what (palms up shrug) + question face", "Work sign + what gesture + question", "Job/work fists + question expression", "Work sign + palms up what + question face") },
      { phrase: "Do you have clean water?", description: "Water sign + clean/good + question", signs: allSigns("W-hand tap chin (water) + flat hand wipe (clean) + thumbs up + question", "Water sign + clean gesture + question face", "Water tap chin + clean wipe + good sign + question", "Water sign + clean hands + question expression") },
      { phrase: "Where is the nearest health facility?", description: "Where + near + hospital signs", signs: allSigns("Where (palms up shake) + close/near gesture + hospital cross sign", "Where question + nearby sign + medical facility", "Location question + close gesture + health cross", "Where palms + near sign + hospital cross") },
    ],
  },
  {
    id: "closing",
    name: "Closing & Follow-up",
    icon: Clock,
    phrases: [
      { phrase: "I will come back tomorrow", description: "Self + come back + tomorrow signs", signs: allSigns("Self-point + return gesture (circular) + sleep then sunrise (tomorrow)", "Self + come-back circle + tomorrow sign", "Self-indicate + return motion + next day gesture", "Point self + circular return + tomorrow sign") },
      { phrase: "Do you have any questions for me?", description: "Question + for me signs", signs: allSigns("Question mark gesture + point to self + raised eyebrows", "Ask sign + for-me point + question face", "Question gesture + self-indicate + open expression", "Question sign + self-point + eyebrows up") },
      { phrase: "Here is my contact information", description: "Show card/paper + point to info", signs: allSigns("Card/paper show gesture + point to details + give forward", "Card present + information point + offer gesture", "Paper show + details indicate + give forward", "Card display + info point + hand forward") },
      { phrase: "Thank you, you have been very helpful", description: "Thank you + very + help signs", signs: allSigns("Chin forward (thank you) + both hands emphasize (very) + help sign up", "Thank sign + very much + helpful gesture", "Gratitude + emphasis hands + assist sign", "Thank you forward + big gesture + help sign") },
      { phrase: "Take this medicine as directed", description: "Give + medicine + follow instructions signs", signs: allSigns("Give gesture + medicine palm-tap + follow/obey sign + paper/instructions", "Offer hand + medicine sign + directions gesture", "Give forward + pill sign + instructions follow", "Give gesture + medicine + list/directions mime") },
    ],
  },
];

export const generateQuestionSigns = (questionLabel: string): Record<string, string> => ({
  asl: `Self-point + illustrate "${questionLabel}" + raised eyebrows`,
  bsl: `Self-point + illustrate "${questionLabel}" + questioning face`,
  isl: `Indicate + show "${questionLabel}" + question expression`,
  nsl: `Open palm indicate + mime "${questionLabel}" + question face`,
  hausa: `Point person + describe "${questionLabel}" + ask expression`,
  yoruba: `Indicate + show "${questionLabel}" + head tilt question`,
  igbo: `Point + gesture "${questionLabel}" + questioning look`,
  idoma: `Indicate person + mime "${questionLabel}" + ask`,
  nupe: `Point + show "${questionLabel}" + question expression`,
  gbagyi: `Indicate + describe "${questionLabel}" + raised brows`,
  tiv: `Point out + mime "${questionLabel}" + question face`,
});
