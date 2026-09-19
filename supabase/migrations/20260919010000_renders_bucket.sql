-- Rendered MP4s and thumbnails. Public because the Instagram Graph API
-- fetches the video from a public URL when publishing. Objects are written
-- only by the server (service role); there are no client write policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('renders', 'renders', true, 52428800, array['video/mp4', 'image/jpeg'])
on conflict (id) do nothing;
