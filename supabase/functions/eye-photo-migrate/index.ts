import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { storeEyePhotos } from '../_shared/eyePhotoStorage.ts';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try {
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),auth=req.headers.get('Authorization');
    if(!url||!key||!service||!auth)return json({error:'Sign in required'},401);
    const client=createClient(url,key,{global:{headers:{Authorization:auth}}});
    const {data:user,error:authError}=await client.auth.getUser();if(authError||!user.user)return json({error:'Sign in required'},401);
    const input=z.object({project_id:z.string().uuid(),report_id:z.string().uuid()}).safeParse(await req.json());
    if(!input.success)return json({error:'Invalid project/report'},400);
    const {data:allowed}=await client.rpc('has_role',{_user_id:user.user.id,_role:'super_admin'});
    if(!allowed)return json({error:'Super Admin required'},403);
    const {data:visible,error:visibilityError}=await client.from('eye_daily_reports').select('id').eq('id',input.data.report_id).eq('project_id',input.data.project_id).single();
    if(visibilityError||!visible)return json({error:'Report access required'},403);
    const db=createClient(url,service,{auth:{persistSession:false}});
    const {data:r,error}=await db.from('eye_daily_reports').select('attachments,updated_at').eq('id',input.data.report_id).eq('project_id',input.data.project_id).single();
    if(error||!r)throw new Error('Report unavailable');
    if(!r.attachments.some((a:{ref?:string})=>a.ref?.startsWith('data:')))return json({migrated:false,already_stored:true});
    const attachments=await storeEyePhotos(db,input.data.project_id,input.data.report_id,r.attachments);
    let update=db.from('eye_daily_reports').update({attachments}).eq('id',input.data.report_id).eq('project_id',input.data.project_id);
    update=r.updated_at?update.eq('updated_at',r.updated_at):update.is('updated_at',null);
    const {data:changed,error:saveError}=await update.select('id');
    if(saveError)throw new Error('Photo references could not be saved');
    if(!changed?.length)return json({error:'Report changed during migration; retry without overwriting edits'},409);
    return json({migrated:true,photos:attachments.length});
  }catch(error){return json({error:(error as Error).message},500);}
});