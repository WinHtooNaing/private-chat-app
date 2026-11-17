create table if not exists public.couple_rooms (
  id uuid primary key,
  invite_hash text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  room_id uuid not null references public.couple_rooms (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  birthday date not null,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now()
);

create index if not exists couple_members_room_id_idx on public.couple_members (room_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.couple_rooms (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null default '',
  image_path text,
  created_at timestamptz not null default now(),
  constraint messages_content_or_image check (content <> '' or image_path is not null)
);

create index if not exists messages_room_created_idx
  on public.messages (room_id, created_at desc);

alter table public.couple_rooms enable row level security;
alter table public.couple_members enable row level security;
alter table public.messages enable row level security;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.couple_members
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

create or replace function public.lookup_room_id_by_invite(p_invite_hash text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.couple_rooms
  where invite_hash = p_invite_hash
  limit 1;
$$;

revoke all on function public.lookup_room_id_by_invite(text) from public;
grant execute on function public.lookup_room_id_by_invite(text) to anon, authenticated;

create or replace function public.create_couple_room(
  p_room_id uuid,
  p_invite_hash text,
  p_display_name text,
  p_birthday date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in before creating a room.';
  end if;
  if char_length(trim(p_display_name)) not between 2 and 32 then
    raise exception 'Name must be between 2 and 32 characters.';
  end if;
  if exists (select 1 from public.couple_members where user_id = v_user_id) then
    raise exception 'This account already belongs to a room.';
  end if;

  insert into public.couple_rooms (id, invite_hash, created_by)
  values (p_room_id, p_invite_hash, v_user_id);

  insert into public.couple_members (user_id, room_id, display_name, birthday)
  values (v_user_id, p_room_id, trim(p_display_name), p_birthday);

  return p_room_id;
end;
$$;

revoke all on function public.create_couple_room(uuid, text, text, date) from public;
grant execute on function public.create_couple_room(uuid, text, text, date) to authenticated;

create or replace function public.claim_couple_room(
  p_invite_hash text,
  p_display_name text,
  p_birthday date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before joining a room.';
  end if;
  if char_length(trim(p_display_name)) not between 2 and 32 then
    raise exception 'Name must be between 2 and 32 characters.';
  end if;

  select id into v_room_id
  from public.couple_rooms
  where invite_hash = p_invite_hash
  for update;

  if v_room_id is null then
    raise exception 'Invite code not found.';
  end if;
  if exists (
    select 1 from public.couple_members
    where user_id = v_user_id and room_id = v_room_id
  ) then
    return v_room_id;
  end if;
  if exists (select 1 from public.couple_members where user_id = v_user_id) then
    raise exception 'This account already belongs to another room.';
  end if;
  if (select count(*) from public.couple_members where room_id = v_room_id) >= 2 then
    raise exception 'This room already has two members.';
  end if;

  insert into public.couple_members (user_id, room_id, display_name, birthday)
  values (v_user_id, v_room_id, trim(p_display_name), p_birthday);

  return v_room_id;
end;
$$;

revoke all on function public.claim_couple_room(text, text, date) from public;
grant execute on function public.claim_couple_room(text, text, date) to authenticated;

create or replace function public.mark_room_read()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_read_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Sign in before updating a read receipt.';
  end if;

  update public.couple_members
  set last_read_at = v_read_at
  where user_id = v_user_id;

  if not found then
    raise exception 'Chat profile not found.';
  end if;

  return v_read_at;
end;
$$;

revoke all on function public.mark_room_read() from public;
grant execute on function public.mark_room_read() to authenticated;

drop policy if exists "Room members can read their room" on public.couple_rooms;
create policy "Room members can read their room"
  on public.couple_rooms for select to authenticated
  using (public.is_room_member(id));

drop policy if exists "Room members can read member profiles" on public.couple_members;
create policy "Room members can read member profiles"
  on public.couple_members for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "Members can update their own read receipt" on public.couple_members;

drop policy if exists "Room members can read messages" on public.messages;
create policy "Room members can read messages"
  on public.messages for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "Room members can send messages as themselves" on public.messages;
create policy "Room members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_room_member(room_id));

grant select on public.couple_rooms, public.couple_members, public.messages to authenticated;
revoke update (last_read_at) on public.couple_members from authenticated;
grant insert (room_id, sender_id, content, image_path) on public.messages to authenticated;

drop policy if exists "Room members can receive private realtime state" on realtime.messages;
create policy "Room members can receive private realtime state"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.couple_members
      where user_id = auth.uid()
        and realtime.topic() = 'couple:' || room_id::text
    )
  );

drop policy if exists "Room members can send private realtime state" on realtime.messages;
create policy "Room members can send private realtime state"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.couple_members
      where user_id = auth.uid()
        and realtime.topic() = 'couple:' || room_id::text
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

drop policy if exists "Room members can read chat images" on storage.objects;
create policy "Room members can read chat images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and exists (
      select 1 from public.couple_members
      where user_id = auth.uid()
        and room_id::text = split_part(name, '/', 1)
    )
  );

drop policy if exists "Members can upload their own chat images" on storage.objects;
create policy "Members can upload their own chat images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and split_part(name, '/', 2) = auth.uid()::text
    and exists (
      select 1 from public.couple_members
      where user_id = auth.uid()
        and room_id::text = split_part(name, '/', 1)
    )
  );

drop policy if exists "Members can remove their own chat images" on storage.objects;
create policy "Members can remove their own chat images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and split_part(name, '/', 2) = auth.uid()::text
    and exists (
      select 1 from public.couple_members
      where user_id = auth.uid()
        and room_id::text = split_part(name, '/', 1)
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'couple_members'
  ) then
    alter publication supabase_realtime add table public.couple_members;
  end if;
end $$;
