import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export default function LogframeColorField({ value, onChange, label }: { value?: string; onChange: (value?: string) => void; label: string }) {
  return <div className="flex items-center gap-2">
    <Input aria-label={label} type="color" value={value ?? "#168a83"} onChange={e => onChange(e.target.value)} className="h-10 w-12 cursor-pointer p-1" />
    <Input aria-label={`${label} hex`} value={value ?? ""} placeholder="Default colour" onChange={e => onChange(e.target.value || undefined)} className="h-10 w-36 font-mono" />
    <Button variant="ghost" size="icon" aria-label={`Reset ${label}`} onClick={() => onChange(undefined)}><RotateCcw className="h-4 w-4" /></Button>
  </div>;
}