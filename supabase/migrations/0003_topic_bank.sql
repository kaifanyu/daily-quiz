-- Daily Quiz — weighted topic bank
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Two-level weighted sampling for quiz generation:
--   * topic_categories carry a relative weight that controls the quiz's CATEGORY MIX
--     (e.g. 20% RL, 30% C++).
--   * topics carry a relative weight WITHIN their category.
-- Weights are RELATIVE — they do NOT need to sum to 100. The sampler normalizes
-- them at selection time, so you can add/edit one without rebalancing the rest.
-- Single-user, no-auth app; all access is via the service-role key, so RLS is
-- left disabled (consistent with 0001).

create extension if not exists "pgcrypto";

create table if not exists topic_categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique,
  weight double precision not null default 1,   -- relative; normalized at sample time
  enabled boolean not null default true,
  sort_order int not null default 0
);
create index if not exists topic_categories_sort_idx on topic_categories (sort_order, name);

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category_id uuid not null references topic_categories(id) on delete cascade,
  name text not null,
  weight double precision not null default 1,   -- relative within the category
  enabled boolean not null default true,
  -- Personal steering fields. The sampler surfaces a rotating subset of
  -- `subtopics` each run so the same topic yields different questions over time.
  subtopics text[] not null default '{}',       -- facets to rotate through
  angle text,                                   -- preferred question style / focus
  personal_note text,                           -- personal context to tailor questions
  keep_getting_wrong text[] not null default '{}'  -- points to reinforce
);
create index if not exists topics_category_idx on topics (category_id);
