create type public.app_role as enum ('admin','artist','user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  artist_id uuid references public.artists(id) on delete cascade,
  unique (user_id, role, artist_id)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.is_artist_of(_user uuid, _artist uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user and role='artist' and artist_id=_artist)
$$;

create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_artist boolean not null default false,
  nodded boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.room_messages to anon, authenticated;
grant insert, update on public.room_messages to authenticated;
grant all on public.room_messages to service_role;
alter table public.room_messages enable row level security;
create policy "room readable" on public.room_messages for select using (true);
create policy "room insert" on public.room_messages for insert to authenticated with check (
  auth.uid() = user_id and length(content) between 1 and 280
  and (is_artist = false or public.is_artist_of(auth.uid(), artist_id)) and nodded = false
);
create policy "artist nods" on public.room_messages for update to authenticated
  using (public.is_artist_of(auth.uid(), artist_id)) with check (public.is_artist_of(auth.uid(), artist_id));

create or replace function public.on_nod() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.nodded and not old.nodded then perform public.add_points(new.user_id, 20); end if;
  return new;
end $$;
create trigger room_nod after update on public.room_messages for each row execute function public.on_nod();

create table public.room_reactions (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now()
);
grant select on public.room_reactions to anon, authenticated;
grant insert on public.room_reactions to authenticated;
grant all on public.room_reactions to service_role;
alter table public.room_reactions enable row level security;
create policy "reactions readable" on public.room_reactions for select using (true);
create policy "react" on public.room_reactions for insert to authenticated with check (auth.uid() = user_id and emoji in ('💗','🔥','😂','😢','👏','🎶'));

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  options text[] not null,
  by_artist boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.polls to anon, authenticated;
grant insert on public.polls to authenticated;
grant all on public.polls to service_role;
alter table public.polls enable row level security;
create policy "polls readable" on public.polls for select using (true);
create policy "create poll" on public.polls for insert to authenticated with check (
  auth.uid() = user_id and array_length(options,1) between 2 and 4
  and (by_artist = false or public.is_artist_of(auth.uid(), artist_id))
);

create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index int not null,
  primary key (poll_id, user_id)
);
grant select on public.poll_votes to anon, authenticated;
grant insert on public.poll_votes to authenticated;
grant all on public.poll_votes to service_role;
alter table public.poll_votes enable row level security;
create policy "votes readable" on public.poll_votes for select using (true);
create policy "vote" on public.poll_votes for insert to authenticated with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.room_messages;
alter publication supabase_realtime add table public.room_reactions;
alter publication supabase_realtime add table public.poll_votes;
alter publication supabase_realtime add table public.polls;