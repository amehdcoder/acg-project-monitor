import { useMediaUrl } from '@/lib/programmeModule/media';
export default function SourcePhotoPreview({refPath,label}:{refPath:string;label:string}) {
  const url=useMediaUrl(refPath);
  if(!url)return <div className="flex h-36 items-center justify-center bg-muted text-xs text-muted-foreground">Source photo unavailable offline or loading…</div>;
  return <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={label||'Report source document'} loading="lazy" className="h-36 w-full rounded-md border object-contain bg-muted"/></a>;
}