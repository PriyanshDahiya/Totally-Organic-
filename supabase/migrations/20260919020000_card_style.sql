-- Per-card presentation, picked at generation so the browser preview and the
-- final render match: {textPosition: 'top'|'upper'|'center',
-- music: {url, title, credit} | null}.
alter table public.generation_jobs add column if not exists style jsonb;

-- Royalty-free background music. Tracks are uploaded by us (service role),
-- never by users; the app picks one per card from whatever is in here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music', 'music', true, 20971520, array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav'])
on conflict (id) do nothing;
