import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
type Event = { id: string; lat: number; lng: number; title: string; kind: string; date: string | null; source: string | null; provider: string };
let cached: { at: number; events: Event[]; feeds: { name: string; ok: boolean }[] } | null = null;
let pending: Promise<NonNullable<typeof cached>> | null = null;
const feedNames = ["fires", "weather", "gdelt"] as const;
async function refresh() {
  if (cached && Date.now()-cached.at<300000) return cached;
  if (pending) return pending;
  pending=(async()=>{
    const results=await Promise.all(feedNames.map(async(name)=>{
      try {
        const r=await fetch(`https://osirisai.live/api/${name}`,{signal:AbortSignal.timeout(12000),redirect:"error"});
        if(!r.ok) throw new Error(`OSIRIS ${name} ${r.status}`);
        const text=await r.text();if(text.length>8000000) throw new Error("Feed too large");
        const data=JSON.parse(text);const rows=name==="fires"?data.fires:data.events;
        const events: Event[]=(Array.isArray(rows)?rows:[]).flatMap((e: Record<string,unknown>,i:number)=>{
          const lat=Number(e.lat),lng=Number(e.lng);
          if(e.lat==null||e.lng==null||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<4||lat>14||lng<2.6||lng>14.8)return [];
          const rawUrl=String(e.source??e.url??"");let source:string|null=null;
          try { const u=new URL(rawUrl);if(u.protocol==="https:"||u.protocol==="http:")source=u.href; } catch {}
          return [{id:`${name}:${String(e.id??i)}`,lat,lng,title:String(e.title??e.name??"Satellite fire detection").slice(0,400),kind:name==="fires"?"fire":name==="weather"?"weather":"event",date:e.date?String(e.date):null,source,provider:String(e.provider??(name==="fires"?"NASA FIRMS via OSIRIS":"OSIRIS public event feed"))}];
        }).slice(0,5000);
        return {events,feed:{name,ok:true}};
      }catch{return {events:[],feed:{name,ok:false}};}
    }));
    const value={at:Date.now(),events:results.flatMap(r=>r.events),feeds:results.map(r=>r.feed)};
    if(value.feeds.some(f=>f.ok))cached=value;
    return value;
  })();
  try{return await pending;}finally{pending=null;}
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
  const auth=req.headers.get("Authorization");
  if(!url||!key||!auth)return new Response(JSON.stringify({error:"Sign in required"}),{status:401,headers:{...corsHeaders,"Content-Type":"application/json"}});
  const client=createClient(url,key,{global:{headers:{Authorization:auth}}});
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)return new Response(JSON.stringify({error:"Sign in required"}),{status:401,headers:{...corsHeaders,"Content-Type":"application/json"}});
  const result=await refresh();
  return new Response(JSON.stringify({...result,fetchedAt:new Date(result.at).toISOString(),scope:"Nigeria bounds; public context only"}),{headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"private, max-age=120"}});
});