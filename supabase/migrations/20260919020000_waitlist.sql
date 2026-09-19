-- Pre-launch waitlist, filled from the public landing page (site/index.html).
-- The public key may only insert; reading is service-role only.
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null unique check (char_length(email) <= 200),
  website text check (char_length(website) <= 300),
  category text check (char_length(category) <= 60),
  phone text check (char_length(phone) <= 20),
  wants_call boolean not null default false,
  plan text check (plan in ('Seed', 'Sprout', 'Harvest'))
);

alter table public.waitlist enable row level security;

drop policy if exists "Anyone can join the waitlist" on public.waitlist;
create policy "Anyone can join the waitlist" on public.waitlist
  for insert to anon, authenticated with check (true);

grant insert on public.waitlist to anon, authenticated;
