interface PhotoStorageClient { storage: { from(bucket: string): { upload(path: string, bytes: Uint8Array, options: {contentType:string;upsert:boolean}): PromiseLike<{error:unknown}>; download(path: string): PromiseLike<{data:Blob|null;error:unknown}> } } }
export async function storeEyePhotos(db: PhotoStorageClient, project: string, report: string, raw: unknown) {
  if (!Array.isArray(raw) || raw.length > 30) throw new Error('Invalid report attachments');
  const output=[];
  for (const a of raw) {
    if (!a || typeof a.ref !== 'string') throw new Error('Invalid photo reference');
    if (!a.ref.startsWith('data:')) { output.push(a); continue; }
    const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(a.ref);
    if (!match) throw new Error('Unsupported inline photo format');
    const binary=atob(match[2].replace(/\s/g,''));
    if (binary.length > 20*1024*1024) throw new Error('Photo exceeds 20 MB');
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
    const extension=match[1]==='image/jpeg'?'jpg':match[1].split('/')[1];
    const path=`${project}/eye-reports/${report}/${hash}.${extension}`;
    const {error}=await db.storage.from('beneficiary-media').upload(path,bytes,{contentType:match[1],upsert:true});
    if (error) throw new Error('Private photo upload failed');
    // Verify the stored bytes before removing the embedded original.
    const {data:stored,error:readError}=await db.storage.from('beneficiary-media').download(path);
    if(readError||!stored)throw new Error('Photo storage verification failed');
    const storedHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await stored.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(storedHash!==hash)throw new Error('Photo checksum mismatch');
    output.push({...a,ref:path,pending:false,size:bytes.length,mime:match[1]});
  }
  return output;
}