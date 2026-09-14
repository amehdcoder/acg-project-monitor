-- 1) Backfill legacy full-URL attachment references to canonical relative paths
update public.chat_messages
set attachment_url = split_part(attachment_url, '/chat-attachments/', 2)
where attachment_url like '%/chat-attachments/%';

-- 2) Enforce canonical relative path at write time
create or replace function public.enforce_canonical_chat_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.attachment_url is not null then
    -- Normalise any legacy full URL to the relative object path
    if new.attachment_url like '%/chat-attachments/%' then
      new.attachment_url := split_part(new.attachment_url, '/chat-attachments/', 2);
    end if;
    -- Reject anything still not a plain relative path
    if new.attachment_url ~ '://' or new.attachment_url like '/%' or new.attachment_url like '%..%' then
      raise exception 'attachment_url must be a canonical relative storage path';
    end if;
    -- The path must live in the sender''s own folder (skip for service-role writes)
    if auth.uid() is not null and split_part(new.attachment_url, '/', 1) <> auth.uid()::text then
      raise exception 'attachment_url must reference the sender''s own storage folder';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_canonical_chat_attachment on public.chat_messages;
create trigger trg_canonical_chat_attachment
before insert or update of attachment_url on public.chat_messages
for each row execute function public.enforce_canonical_chat_attachment();

-- 3) Tighten the storage read policy to exact path matching (data is now canonical)
drop policy if exists "Chat attachment access scoped to group members" on storage.objects;
create policy "Chat attachment access scoped to group members"
on storage.objects for select
using (
  bucket_id = 'chat-attachments'
  and (
    (auth.uid())::text = (storage.foldername(name))[1]
    or is_admin(auth.uid())
    or exists (
      select 1
      from public.chat_messages m
      join public.chat_group_members gm
        on gm.chat_group_id = m.chat_group_id
       and gm.user_id = auth.uid()
      where m.attachment_url = objects.name
    )
  )
);