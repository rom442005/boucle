-- Boucle : base de la communauté (Supabase, PostgreSQL).
-- À exécuter une fois dans l'éditeur SQL du projet Supabase (SQL Editor > New query > Run).
-- Tout est protégé par des règles d'accès (Row Level Security) : chacun ne modifie que ce qui est à lui.

-- ---------------------------------------------------------------- Profils

-- Profil public : ce que la communauté voit.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 40),
  city text check (city is null or char_length(city) <= 60),
  sports text[] not null default '{}' check (sports <@ array['run', 'trail', 'road', 'gravel']),
  level text not null default 'regular' check (level in ('debut', 'regular', 'confirmed', 'expert')),
  practice_years int check (practice_years is null or practice_years between 0 and 80),
  bio text check (bio is null or char_length(bio) <= 300),
  created_at timestamptz not null default now()
);

-- Ce que seul l'intéressé voit : son année de naissance (Boucle est réservé aux 15 ans et plus).
create table if not exists public.profiles_private (
  id uuid primary key references auth.users (id) on delete cascade,
  birth_year int not null check (birth_year between 1900 and 2100),
  accepted_terms_at timestamptz not null default now()
);

create or replace function public.check_age() returns trigger language plpgsql as $$
begin
  if extract(year from now())::int - new.birth_year < 15 then
    raise exception 'Boucle est réservé aux personnes de 15 ans et plus.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_private_age on public.profiles_private;
create trigger profiles_private_age before insert or update on public.profiles_private
  for each row execute function public.check_age();

-- ---------------------------------------------------------------- Parcours publiés

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  sport text not null check (sport in ('run', 'trail', 'road', 'gravel')),
  shape text not null check (shape in ('loop', 'outback', 'oneway')),
  distance_m int not null check (distance_m > 0),
  ascent_m int not null default 0,
  -- premier point visible (le départ réel est masqué : zone privée)
  start_lat double precision not null,
  start_lng double precision not null,
  -- tracé compact (polyligne, profil d'altitude), au format des liens de partage
  data jsonb not null,
  likes_count int not null default 0,
  comments_count int not null default 0,
  uses_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists routes_start_idx on public.routes (start_lat, start_lng);
create index if not exists routes_created_idx on public.routes (created_at desc);
create index if not exists routes_author_idx on public.routes (author_id, created_at desc);

-- ---------------------------------------------------------------- J'aime, commentaires, abonnements

create table if not exists public.likes (
  route_id uuid not null references public.routes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (route_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_route_idx on public.comments (route_id, created_at);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);

-- ---------------------------------------------------------------- Modération

-- Personnes masquées : leurs parcours et commentaires disparaissent pour celui qui les masque.
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Signalements : lus par l'éditeur dans le tableau de bord Supabase (Table Editor > reports).
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  route_id uuid references public.routes (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 300),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(route_id, comment_id, profile_id) = 1)
);

-- ---------------------------------------------------------------- Compteurs

create or replace function public.bump_likes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.routes set likes_count = likes_count + 1 where id = new.route_id;
  else
    update public.routes set likes_count = greatest(0, likes_count - 1) where id = old.route_id;
  end if;
  return null;
end $$;
drop trigger if exists likes_count on public.likes;
create trigger likes_count after insert or delete on public.likes for each row execute function public.bump_likes();

create or replace function public.bump_comments() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.routes set comments_count = comments_count + 1 where id = new.route_id;
  else
    update public.routes set comments_count = greatest(0, comments_count - 1) where id = old.route_id;
  end if;
  return null;
end $$;
drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments for each row execute function public.bump_comments();

-- « Utilisé N fois » : un parcours repris (favori, suivi, GPX) par quelqu'un d'autre que son auteur.
create or replace function public.use_route(rid uuid) returns void language sql security definer set search_path = public as $$
  update public.routes set uses_count = uses_count + 1 where id = rid and author_id <> auth.uid();
$$;

-- Supprimer son compte (exigé par l'App Store) : tout ce qui en dépend part avec lui.
create or replace function public.delete_account() returns void language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
revoke all on function public.use_route(uuid) from public, anon;
grant execute on function public.use_route(uuid) to authenticated;

-- ---------------------------------------------------------------- Vues pour l'app

-- Parcours avec leur auteur, et « aimé par moi ».
create or replace view public.routes_feed with (security_invoker = on) as
  select r.*, p.first_name as author_name, p.level as author_level, p.city as author_city,
         exists (select 1 from public.likes l where l.route_id = r.id and l.user_id = auth.uid()) as liked_by_me
  from public.routes r join public.profiles p on p.id = r.author_id;

create or replace view public.comments_feed with (security_invoker = on) as
  select c.*, p.first_name as author_name, p.level as author_level
  from public.comments c join public.profiles p on p.id = c.author_id;

create or replace view public.profile_stats with (security_invoker = on) as
  select p.id,
         (select count(*) from public.routes r where r.author_id = p.id)::int as routes,
         (select count(*) from public.follows f where f.followee_id = p.id)::int as followers,
         (select count(*) from public.follows f where f.follower_id = p.id)::int as following,
         (select coalesce(sum(r.likes_count), 0) from public.routes r where r.author_id = p.id)::int as likes,
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id) as followed_by_me
  from public.profiles p;

-- ---------------------------------------------------------------- Règles d'accès

alter table public.profiles enable row level security;
alter table public.profiles_private enable row level security;
alter table public.routes enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- Lecture publique : profils, parcours publiés, j'aime, commentaires, abonnements.
drop policy if exists "profils lisibles" on public.profiles;
create policy "profils lisibles" on public.profiles for select using (true);
drop policy if exists "son profil" on public.profiles;
create policy "son profil" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "son profil privé" on public.profiles_private;
create policy "son profil privé" on public.profiles_private for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "parcours lisibles" on public.routes;
create policy "parcours lisibles" on public.routes for select using (true);
drop policy if exists "publier" on public.routes;
create policy "publier" on public.routes for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "modifier ses parcours" on public.routes;
create policy "modifier ses parcours" on public.routes for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "retirer ses parcours" on public.routes;
create policy "retirer ses parcours" on public.routes for delete to authenticated using (author_id = auth.uid());

drop policy if exists "j'aime lisibles" on public.likes;
create policy "j'aime lisibles" on public.likes for select using (true);
drop policy if exists "aimer" on public.likes;
create policy "aimer" on public.likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "ne plus aimer" on public.likes;
create policy "ne plus aimer" on public.likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "commentaires lisibles" on public.comments;
create policy "commentaires lisibles" on public.comments for select using (true);
drop policy if exists "commenter" on public.comments;
create policy "commenter" on public.comments for insert to authenticated with check (author_id = auth.uid());
-- Un commentaire se retire par son auteur, ou par l'auteur du parcours (sa page, sa modération).
drop policy if exists "retirer un commentaire" on public.comments;
create policy "retirer un commentaire" on public.comments for delete to authenticated using (
  author_id = auth.uid() or exists (select 1 from public.routes r where r.id = route_id and r.author_id = auth.uid())
);

drop policy if exists "abonnements lisibles" on public.follows;
create policy "abonnements lisibles" on public.follows for select using (true);
drop policy if exists "s'abonner" on public.follows;
create policy "s'abonner" on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "se désabonner" on public.follows;
create policy "se désabonner" on public.follows for delete to authenticated using (follower_id = auth.uid());

drop policy if exists "ses blocages" on public.blocks;
create policy "ses blocages" on public.blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

drop policy if exists "signaler" on public.reports;
create policy "signaler" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
