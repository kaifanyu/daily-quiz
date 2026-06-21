-- Daily Quiz — remove weak-topic extraction and AI evaluation summaries.
-- The app no longer generates weak topics or an overall feedback summary; grading
-- is fully deterministic (MCQ answer key + echoed short answers). Run this in the
-- Supabase SQL editor (or `supabase db push`) once you no longer need the old data.
--
-- NOTE: This is destructive and irreversible — it drops the weak_topics table and
-- two evaluation columns along with any data they hold.

drop table if exists weak_topics;

alter table evaluations drop column if exists weak_topics;
alter table evaluations drop column if exists overall_summary;
