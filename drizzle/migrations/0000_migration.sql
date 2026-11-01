create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'فان جديد',
  bio text,
  points int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable" on public.profiles for select using (true);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- prevent users editing their own points
create or replace function public.protect_points() returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('app.allow_points', true) is distinct from 'on' then
    new.points := old.points;
  end if;
  return new;
end $$;
create trigger profiles_protect_points before update on public.profiles for each row execute function public.protect_points();

create or replace function public.add_points(_user uuid, _amount int) returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.allow_points', 'on', true);
  update public.profiles set points = points + _amount where id = _user;
  perform set_config('app.allow_points', 'off', true);
end $$;
revoke all on function public.add_points(uuid, int) from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  field text not null,
  bio text not null,
  image text not null,
  created_at timestamptz not null default now()
);
grant select on public.artists to anon, authenticated;
grant all on public.artists to service_role;
alter table public.artists enable row level security;
create policy "artists readable" on public.artists for select using (true);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'thought',
  content text not null,
  created_at timestamptz not null default now()
);
grant select on public.posts to anon, authenticated;
grant insert, delete on public.posts to authenticated;
grant all on public.posts to service_role;
alter table public.posts enable row level security;
create policy "posts readable" on public.posts for select using (true);
create policy "own posts insert" on public.posts for insert to authenticated with check (auth.uid() = user_id and length(content) between 1 and 1000);
create policy "own posts delete" on public.posts for delete to authenticated using (auth.uid() = user_id);

create or replace function public.on_post_created() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.add_points(new.user_id, case new.kind when 'art' then 15 when 'translation' then 12 when 'help' then 10 else 5 end);
  return new;
end $$;
create trigger post_points after insert on public.posts for each row execute function public.on_post_created();

-- private appreciations: only author of the post sees count
create table public.appreciations (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
grant select, insert, delete on public.appreciations to authenticated;
grant all on public.appreciations to service_role;
alter table public.appreciations enable row level security;
create policy "see own or received" on public.appreciations for select to authenticated using (
  auth.uid() = user_id or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
);
create policy "give appreciation" on public.appreciations for insert to authenticated with check (
  auth.uid() = user_id and not exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
);
create policy "remove own" on public.appreciations for delete to authenticated using (auth.uid() = user_id);

create or replace function public.on_appreciation() returns trigger language plpgsql security definer set search_path = public as $$
declare _author uuid;
begin
  select user_id into _author from public.posts where id = new.post_id;
  perform public.add_points(_author, 2);
  return new;
end $$;
create trigger appreciation_points after insert on public.appreciations for each row execute function public.on_appreciation();

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null,
  description text not null,
  ends_at date not null
);
grant select on public.challenges to anon, authenticated;
grant all on public.challenges to service_role;
alter table public.challenges enable row level security;
create policy "challenges readable" on public.challenges for select using (true);

create table public.group_projects (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null,
  description text not null,
  goal int not null
);
grant select on public.group_projects to anon, authenticated;
grant all on public.group_projects to service_role;
alter table public.group_projects enable row level security;
create policy "projects readable" on public.group_projects for select using (true);

create table public.project_contributions (
  project_id uuid not null references public.group_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
grant select on public.project_contributions to anon, authenticated;
grant insert on public.project_contributions to authenticated;
grant all on public.project_contributions to service_role;
alter table public.project_contributions enable row level security;
create policy "contrib readable" on public.project_contributions for select using (true);
create policy "join project" on public.project_contributions for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.on_contribution() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.add_points(new.user_id, 8); return new; end $$;
create trigger contribution_points after insert on public.project_contributions for each row execute function public.on_contribution();

insert into public.artists (slug, name, field, bio, image) values
('layla-noor','ليلى نور','غناء','صوت دافئ يجمع بين الطرب الأصيل والبوب الحديث.','layla'),
('omar-sahel','عمر الساحل','تمثيل','ممثل يحب الأدوار الإنسانية والقصص القريبة من الناس.','omar'),
('nour-beats','نور بيتس','موسيقى إلكترونية','منتج موسيقي يمزج الإيقاعات الشرقية بالإلكترونيات.','nour'),
('salma-ink','سلمى إنك','رسم','رسامة تحوّل الحكايات الشعبية إلى لوحات ملونة.','salma');

insert into public.challenges (artist_id, title, description, ends_at)
select id, 'ارسم لحظتك المفضلة', 'شارك رسمة أو تصميم مستوحى من عمل الفنان المفضل لديك.', current_date + 14 from public.artists;
insert into public.challenges (artist_id, title, description, ends_at)
select id, 'ترجمة للعالم', 'ساعد فانز من بلدان أخرى بترجمة كلمات أو مقابلات.', current_date + 21 from public.artists;

insert into public.group_projects (artist_id, title, description, goal)
select id, 'رسالة شكر جماعية', 'كل فان يكتب سطرًا، ونرسلها معًا في نهاية الشهر.', 100 from public.artists;
insert into public.group_projects (artist_id, title, description, goal)
select id, 'مبادرة خيرية باسم المجتمع', 'نشارك بوقتنا في مبادرة تطوعية تحمل روح الفنان.', 50 from public.artists;