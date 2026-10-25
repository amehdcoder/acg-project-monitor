import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WifiOff, Wifi, Calendar, Building2, Users, MapPin, Accessibility, Eye, ClipboardCheck, Leaf } from 'lucide-react';
export type WizardSection = { id: string; title: string; icon?: React.ComponentType<{className?: string}> };
interface Props { sections: WizardSection[]; scrollContainerRef?: React.RefObject<HTMLDivElement>; completion?: Record<string,number>; lastSavedAt?: number | null; className?: string; }
export default function MicroplanWizardChrome({sections,scrollContainerRef,lastSavedAt,className}:Props) {
 const [activeIdx,setActiveIdx]=useState(0);
 const [online,setOnline]=useState(navigator.onLine);
 useEffect(()=>{ const on=()=>setOnline(true), off=()=>setOnline(false); window.addEventListener('online',on);window.addEventListener('offline',off); return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);}; },[]);
 useEffect(()=>{
  const root=scrollContainerRef?.current;
  const targets=sections.map(s=>root?.querySelector(`#section-${s.id}`)).filter((el):el is Element=>!!el);
  const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0]){const idx=sections.findIndex(s=>`section-${s.id}`===visible[0].target.id);if(idx>=0)setActiveIdx(idx);}}, {root:root || null,rootMargin:'-120px 0px -55% 0px'});
  targets.forEach(el=>observer.observe(el));return()=>observer.disconnect();
 },[sections,scrollContainerRef]);
 const scrollTo=(idx:number)=>{const section=sections[idx];if(!section)return;scrollContainerRef?.current?.querySelector(`#section-${section.id}`)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});setActiveIdx(idx);};
 const icons=[Calendar,Building2,Building2,Users,MapPin,MapPin,Users,Accessibility,Eye,ClipboardCheck,Leaf];
 return <div className={`microplan-wizard sticky top-0 z-20 mb-3 ${className || ''}`}>
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="flex items-center gap-3 min-w-0"><span className="microplan-section-number"><ClipboardCheck className="h-5 w-5"/></span><div><h1 className="text-lg font-bold text-foreground">New Microplan Entry</h1><p className="text-xs text-muted-foreground">Plan, target and track frontline implementation</p></div></div>
   <Badge variant="outline" className="shrink-0 gap-1 text-xs">{online?<Wifi className="h-3 w-3"/>:<WifiOff className="h-3 w-3"/>}{online?'Online':'Offline'}{lastSavedAt?' · Draft saved':''}</Badge>
  </div>
  <nav className="microplan-step-track" aria-label="Microplan sections">{sections.map((section,idx)=>{const Icon=icons[idx] || ClipboardCheck;return <Button key={section.id} variant="ghost" type="button" className="microplan-step" aria-current={idx===activeIdx?'step':undefined} onClick={()=>scrollTo(idx)}><span className="microplan-step-icon"><Icon className="h-4 w-4"/></span><span>{idx+1} {section.title.split(' ')[0]}</span></Button>;})}</nav>
 </div>;
}
