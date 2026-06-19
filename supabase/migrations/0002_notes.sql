-- Daily Quiz — notes feature
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Single-user, no-auth personal app. All access goes through trusted server-side
-- code using the service-role key, so RLS is left disabled (consistent with 0001).

create extension if not exists "pgcrypto";

-- Personal notes: rich-text (HTML) content from the editor, organized by category.
-- Images are uploaded to the `note-images` bucket and embedded inline in `content`
-- as <img src>; they live under a `notes.id/` folder so deletes can clear them.
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  category text not null default 'General',
  content text not null default '',
  images jsonb not null default '[]',  -- reserved (images are embedded inline in content)
  pinned boolean not null default false
);
create index if not exists notes_updated_at_idx on notes (updated_at desc);
create index if not exists notes_category_idx on notes (category);

-- Public storage bucket for note images. Public so the rendered <img src> works
-- directly; uploads/deletes still happen server-side with the service-role key.
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do nothing;
