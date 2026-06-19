-- Daily Quiz — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- This is a single-user, no-auth personal app. All access goes through trusted
-- server-side code using the service-role key, so RLS is left disabled.

create extension if not exists "pgcrypto";

-- Generated quizzes (full quiz, including answer key, stored in quiz_json).
create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  topics text[] not null default '{}',
  difficulty text not null default 'expert',
  quiz_json jsonb not null,
  source_context_summary text
);
create index if not exists quizzes_created_at_idx on quizzes (created_at desc);

-- One submission per attempt (the app currently allows one submission per quiz).
create table if not exists quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quiz_id uuid references quizzes(id) on delete cascade,
  mcq_answers jsonb not null default '{}',
  short_answers jsonb not null default '{}'
);
create index if not exists quiz_submissions_quiz_idx on quiz_submissions (quiz_id, created_at desc);

-- AI evaluation of a submission. mcq_correct/mcq_total are denormalized for the
-- dashboard's simple, secondary stats.
create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quiz_id uuid references quizzes(id) on delete cascade,
  submission_id uuid references quiz_submissions(id) on delete cascade,
  evaluation_json jsonb not null,
  weak_topics jsonb not null default '[]',
  overall_summary text,
  mcq_correct int not null default 0,
  mcq_total int not null default 0
);
create index if not exists evaluations_submission_idx on evaluations (submission_id);
create index if not exists evaluations_quiz_idx on evaluations (quiz_id);

-- Flattened weak topics for fast dashboard queries.
create table if not exists weak_topics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  topic text not null,
  reason text,
  suggested_review text,
  source_quiz_id uuid references quizzes(id) on delete set null,
  source_submission_id uuid references quiz_submissions(id) on delete set null
);
create index if not exists weak_topics_created_at_idx on weak_topics (created_at desc);

-- Editable AI prompt overrides. Absence of a row => the app uses its built-in default.
create table if not exists prompt_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null unique,
  content text not null
);

-- Uploaded source materials used as quiz-generation context.
create table if not exists source_materials (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  file_name text,
  file_type text,
  storage_path text,
  extracted_text text,
  summary text,
  topic_tags text[] not null default '{}',
  include_in_context boolean not null default true
);
create index if not exists source_materials_created_at_idx on source_materials (created_at desc);
