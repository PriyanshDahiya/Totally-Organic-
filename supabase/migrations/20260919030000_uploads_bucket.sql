-- Founders' own background videos, uploaded from the card editor. Public
-- (unguessable per-user paths) because the browser preview and the renderer
-- both load them by URL. Uploads go through signed upload URLs issued by the
-- server, so there are no client write policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;
