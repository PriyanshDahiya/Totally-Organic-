-- Cards need two things the v1 data model didn't have:
--   why        - the one-line "why this should work" each Blitz card shows
--   background - the stock clip behind a Wall of Text card, including the
--                Pexels credit we're asked to display: {videoUrl, posterUrl,
--                width, height, durationSeconds, credit: {name, url, pexelsUrl}}
-- The caption lives on the card's preview VideoAsset (caption_text), which is
-- created with the card (render_status = 'preview') rather than on approve.
alter table public.generation_jobs
  add column why text,
  add column background jsonb;
