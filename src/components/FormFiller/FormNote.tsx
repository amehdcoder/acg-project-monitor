import { Sparkles } from "lucide-react";

interface FormNoteProps {
  text: string;
  /** Stable seed (e.g. question id) so a given note always gets the same colour */
  seed?: string;
}

// A small palette of soft, flowery rose-toned themes. Each note picks one
// deterministically from its seed so colours vary across notes but stay stable.
const PALETTES = [
  { from: "hsl(346 84% 96%)", to: "hsl(330 80% 92%)", accent: "hsl(340 75% 55%)", ink: "hsl(340 45% 30%)" },
  { from: "hsl(286 70% 96%)", to: "hsl(300 65% 92%)", accent: "hsl(292 60% 52%)", ink: "hsl(292 40% 30%)" },
  { from: "hsl(14 90% 96%)", to: "hsl(26 90% 92%)", accent: "hsl(18 80% 55%)", ink: "hsl(18 50% 32%)" },
  { from: "hsl(255 70% 96%)", to: "hsl(270 65% 93%)", accent: "hsl(262 60% 58%)", ink: "hsl(262 40% 32%)" },
  { from: "hsl(176 60% 95%)", to: "hsl(190 60% 91%)", accent: "hsl(184 55% 42%)", ink: "hsl(186 45% 26%)" },
  { from: "hsl(46 90% 95%)", to: "hsl(36 90% 90%)", accent: "hsl(40 85% 50%)", ink: "hsl(34 55% 30%)" },
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

// Inline SVG of layered rose petals used as a soft decorative background.
const roseSvg = (accent: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
      <g fill='none' stroke='${accent}' stroke-width='1.4' opacity='0.5'>
        <circle cx='30' cy='30' r='6'/>
        <path d='M30 30c-9 0-16-7-16-16M30 30c0-9 7-16 16-16M30 30c9 0 16 7 16 16M30 30c0 9-7 16-16 16'/>
        <circle cx='90' cy='80' r='5'/>
        <path d='M90 80c-7 0-13-6-13-13M90 80c0-7 6-13 13-13M90 80c7 0 13 6 13 13M90 80c0 7-6 13-13 13'/>
        <circle cx='95' cy='25' r='3'/>
        <circle cx='22' cy='92' r='3'/>
      </g>
    </svg>`,
  )}")`;

const FormNote = ({ text, seed = "" }: FormNoteProps) => {
  const p = PALETTES[hashSeed(seed) % PALETTES.length];
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-4 sm:p-5 text-sm leading-relaxed shadow-sm"
      style={{
        backgroundColor: p.from,
        backgroundImage: `${roseSvg(p.accent)}, linear-gradient(135deg, ${p.from}, ${p.to})`,
        backgroundRepeat: "repeat, no-repeat",
        backgroundSize: "120px 120px, cover",
        borderColor: p.accent,
        color: p.ink,
      }}
    >
      <span
        className="absolute left-0 top-0 h-full w-1.5"
        style={{ background: p.accent }}
        aria-hidden
      />
      <div className="relative flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${p.accent}", color: "#fff` as never, backgroundColor: p.accent }}
        >
          <Sparkles className="h-4 w-4 text-white" />
        </span>
        <p className="font-medium pt-0.5 whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
};

export default FormNote;
