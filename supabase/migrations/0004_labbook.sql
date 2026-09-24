-- Private Labbook library. This migration does not import any personal notes.
-- Access is through authenticated server routes using the service-role key.
begin;

create table if not exists public.research_libraries (
  id text primary key default 'default' check (id = 'default'),
  revision bigint not null default 0 check (revision between 0 and 9007199254740990),
  state jsonb not null default '{"version":2,"revision":0,"papers":[],"concepts":[],"attachments":{}}'::jsonb,
  previous_state jsonb,
  updated_at timestamptz not null default now(),
  constraint research_library_shape check (
    jsonb_typeof(state) = 'object'
    and state ?& array['version', 'revision', 'papers', 'concepts', 'attachments']
    and state->'version' = '2'::jsonb
    and jsonb_typeof(state->'revision') = 'number'
    and (state->>'revision')::bigint = revision
    and jsonb_typeof(state->'papers') = 'array'
    and jsonb_typeof(state->'concepts') = 'array'
    and jsonb_typeof(state->'attachments') = 'object'
  )
);

alter table public.research_libraries enable row level security;
alter table public.research_libraries force row level security;

-- No client-facing RLS policies: anonymous/authenticated Data API users have no access.
revoke all on table public.research_libraries from public, anon, authenticated;
grant select, insert, update on table public.research_libraries to service_role;

create or replace function public.save_research_library(expected_revision bigint, next_state jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_revision bigint;
  current_revision bigint;
begin
  if expected_revision is null or expected_revision < 0 or expected_revision >= 9007199254740990
    or next_state is null
    or jsonb_typeof(next_state) is distinct from 'object'
    or next_state->'version' is distinct from '2'::jsonb
    or jsonb_typeof(next_state->'revision') is distinct from 'number'
    or (next_state->>'revision')::bigint is distinct from expected_revision then
    raise exception using errcode = '22023', message = 'Invalid Labbook library or revision';
  end if;

  -- Concurrent first saves serialize on the singleton primary key.
  insert into public.research_libraries (id) values ('default') on conflict (id) do nothing;

  -- PostgreSQL rechecks this revision condition after waiting for another writer.
  -- The snapshot and replacement commit together; a failed update changes neither.
  update public.research_libraries
    set previous_state = state,
        state = jsonb_set(next_state, '{revision}', to_jsonb(expected_revision + 1)),
        revision = expected_revision + 1,
        updated_at = now()
    where id = 'default' and revision = expected_revision
    returning revision into saved_revision;

  if found then
    return jsonb_build_object('saved', true, 'revision', saved_revision);
  end if;

  select revision into current_revision from public.research_libraries where id = 'default';
  return jsonb_build_object('saved', false, 'revision', current_revision);
end;
$$;

-- Functions otherwise receive PUBLIC EXECUTE by default.
revoke all on function public.save_research_library(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_research_library(bigint, jsonb) to service_role;

commit;
