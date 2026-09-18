-- v1 schema: mirrors the Data model table in the build plan doc 1:1.
-- https://claude.ai/artifact/Tei8g3ize2FckKgjyVoyMk

create extension if not exists pgcrypto;

-- User -----------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz not null default now(),
  plan text not null default 'free',
  credits_remaining integer not null default 0 check (credits_remaining >= 0)
);

-- Mirror every new auth user into public.users.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Brand ----------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade, -- one Brand per User in v1
  website_url text not null,
  profile jsonb not null default '{}'::jsonb, -- identity, product, segments, competitors
  angles jsonb not null default '[]'::jsonb,
  tone_dos text[] not null default '{}',
  tone_donts text[] not null default '{}',
  mention_frequency text not null default 'sometimes' check (mention_frequency in ('rarely', 'sometimes', 'often')),
  refreshed_at timestamptz not null default now()
);

-- Product --------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  url text,
  image_urls text[] not null default '{}',
  description text,
  price text
);

-- SocialAccount --------------------------------------------------------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  platform text not null default 'instagram' check (platform in ('instagram', 'facebook')),
  ig_user_id text,
  fb_page_id text,
  access_token text not null, -- encrypted with TOKEN_ENCRYPTION_KEY before insert
  token_expires_at timestamptz
);

-- TrendingClip ---------------------------------------------------------------
create table public.trending_clips (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  media_type text not null check (media_type in ('video', 'image')),
  niche_tags text[] not null default '{}',
  hook_text text not null,
  format text not null check (format in ('wall_of_text', 'slideshow')),
  views bigint,
  fetched_at timestamptz not null default now()
);

-- GenerationJob --------------------------------------------------------------
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  trending_clip_id uuid not null references public.trending_clips (id),
  angle text not null,
  format text not null check (format in ('wall_of_text', 'slideshow')),
  status text not null default 'queued' check (status in ('queued', 'generating', 'done', 'failed')),
  overlay_text text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- VideoAsset -----------------------------------------------------------------
create table public.video_assets (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid not null references public.generation_jobs (id) on delete cascade,
  render_status text not null default 'preview' check (render_status in ('preview', 'rendering', 'rendered', 'failed')),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  video_url text,
  thumbnail_url text,
  caption_text text,
  credits_cost integer not null default 0
);

-- ScheduledPost --------------------------------------------------------------
create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  video_asset_id uuid not null references public.video_assets (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  scheduled_at timestamptz not null,
  posted_at timestamptz,
  platform_post_id text,
  status text not null default 'scheduled' check (status in ('scheduled', 'publishing', 'posted', 'failed', 'cancelled'))
);

-- SubscriptionEvent ----------------------------------------------------------
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  plan text not null,
  credits_granted integer not null default 0,
  billing_event_id text not null unique, -- makes webhook replays idempotent
  occurred_at timestamptz not null default now()
);

create index on public.products (brand_id);
create index on public.generation_jobs (brand_id, requested_at desc);
create index on public.video_assets (generation_job_id);
create index on public.scheduled_posts (status, scheduled_at);
create index on public.trending_clips using gin (niche_tags);

-- Row level security ---------------------------------------------------------
-- Users read their own rows. Writes that touch credits or billing go through
-- the service role (server actions / webhooks), never the browser.
alter table public.users enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.social_accounts enable row level security;
alter table public.trending_clips enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.video_assets enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.subscription_events enable row level security;

create policy "own user row" on public.users for select using (id = auth.uid());

create policy "own brand" on public.brands for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own products" on public.products for all
  using (brand_id in (select id from public.brands where user_id = auth.uid()))
  with check (brand_id in (select id from public.brands where user_id = auth.uid()));

-- social_accounts has no client policy on purpose: it holds access tokens,
-- so it is read and written only by the server with the service role.

create policy "clips readable by signed-in users" on public.trending_clips for select
  using (auth.role() = 'authenticated');

create policy "own jobs" on public.generation_jobs for select
  using (brand_id in (select id from public.brands where user_id = auth.uid()));

create policy "own assets" on public.video_assets for select
  using (generation_job_id in (
    select j.id from public.generation_jobs j
    join public.brands b on b.id = j.brand_id
    where b.user_id = auth.uid()));

create policy "own posts" on public.scheduled_posts for select
  using (social_account_id in (select id from public.social_accounts where user_id = auth.uid()));

create policy "own subscription events" on public.subscription_events for select
  using (user_id = auth.uid());

-- Credits --------------------------------------------------------------------
-- Atomic spend: returns false instead of going negative, so two parallel
-- approvals can't overspend.
create function public.spend_credits(p_user_id uuid, p_amount integer) returns boolean
language sql security definer set search_path = '' as $$
  with updated as (
    update public.users
       set credits_remaining = credits_remaining - p_amount
     where id = p_user_id and credits_remaining >= p_amount
    returning 1
  )
  select exists (select 1 from updated);
$$;

create function public.refund_credits(p_user_id uuid, p_amount integer) returns void
language sql security definer set search_path = '' as $$
  update public.users set credits_remaining = credits_remaining + p_amount where id = p_user_id;
$$;

-- Records a billing event and grants its credits exactly once per billing_event_id.
create function public.grant_credits(p_user_id uuid, p_plan text, p_credits integer, p_billing_event_id text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscription_events (user_id, plan, credits_granted, billing_event_id)
  values (p_user_id, p_plan, p_credits, p_billing_event_id);

  update public.users
     set credits_remaining = credits_remaining + p_credits, plan = p_plan
   where id = p_user_id;
  return true;
exception when unique_violation then
  return false; -- webhook replay: already granted
end;
$$;

revoke execute on function public.spend_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, text, integer, text) from public, anon, authenticated;
