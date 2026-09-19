-- Trending Instagram audios per niche, filled by the weekly trend job, and a
-- per-card suggestion. Audio is suggested, never baked in: trending songs are
-- licensed only inside Instagram's own audio picker.
create table if not exists public.trending_audios (
  audio_id text not null,
  niche_tag text not null,
  title text not null,
  artist text,
  is_original boolean not null default false,
  mood text,
  reel_count integer not null default 0,
  total_views bigint not null default 0,
  seen_at timestamptz not null default now(),
  primary key (audio_id, niche_tag)
);
alter table public.trending_audios enable row level security; -- service role only

alter table public.generation_jobs add column if not exists suggested_audio jsonb;
