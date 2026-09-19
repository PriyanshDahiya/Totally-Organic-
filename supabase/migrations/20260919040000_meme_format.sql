-- Meme (green screen) format: a still backdrop, a setup line and a keyed
-- reaction meme. Meme cards reuse Wall of Text hooks, so only jobs change.
alter table public.generation_jobs drop constraint if exists generation_jobs_format_check;
alter table public.generation_jobs add constraint generation_jobs_format_check
  check (format in ('wall_of_text', 'slideshow', 'green_screen'));
