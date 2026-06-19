# Daily Quiz

A polished, AI-powered **daily learning quiz** for personal use. Click a button to
generate a difficult, interview-level quiz across your areas of interest, answer
everything on one page, submit once, and get detailed AI feedback, corrections,
weak-topic analysis, and a ~1000-word reading section. Everything is stored in
Supabase. No login, no auth — it's a single-user personal app.

Built with **SvelteKit (Svelte 5 runes) · Cloudflare Workers · Supabase · Tailwind v4 · OpenAI**.

---

## What it does

- **Generate** a quiz: 30 multiple-choice + 10 short-answer questions (≥1 coding) + a
  ~1000-word reading passage with comprehension questions.
- **Answer** everything on one interactive page. No answers are revealed before you submit.
- **Submit once** → AI evaluates your short answers, MCQs are graded against the stored
  key, you get explanations, corrections, weak topics, the reading, and a summary.
- **Dashboard** with recent quizzes, history, weak topics, and simple (secondary) stats.
- **Source materials**: upload `.txt`/`.md` or paste text; it's summarized + tagged and
  used as grounding context for generation.
- **Prompt editor**: view/edit/reset the 4 AI prompts; overrides are stored in Supabase.
- **Light/dark mode** with no flash on load.

---

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Dashboard — stats, recent quizzes, weak topics |
| `/quiz/new` | Pick topics + difficulty, generate a quiz |
| `/quiz/[id]` | Take the quiz (answer key withheld) |
| `/quiz/[id]/results` | Results: explanations, feedback, weak topics, reading |
| `/history` | All quizzes |
| `/sources` | Manage source materials |
| `/prompts` | Edit AI prompts |
| `/api/quiz/generate` | `POST` — generate + store a quiz |
| `/api/quiz/[id]/submit` | `POST` — store submission, evaluate, store evaluation |

---

## 1. Prerequisites

- Node 20+ and **yarn** (the project uses yarn).
- A **Supabase** project (URL + service-role key).
- An **OpenAI** API key.

## 2. Install

```sh
yarn
```

## 3. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   (Or, with the Supabase CLI: `supabase db push`.)
3. Get **Project URL** and the **`service_role` key** from *Project Settings → API*.

> The app uses the **service-role key from server-side code only**. It is never sent to
> the browser, and Row-Level Security is intentionally left off for this single-user app.

## 4. Configure environment variables

For local dev, copy the example into `.dev.vars` (the Cloudflare adapter reads this file):

```sh
cp .dev.vars.example .dev.vars
```

Fill in:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o            # optional; defaults to gpt-4o
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`.env.example` documents the same variables. **`.dev.vars` is git-ignored** — don't commit it.

## 5. Run locally

```sh
yarn dev
```

Open the printed URL. From the dashboard click **Generate quiz**.

> Generation makes several AI calls (MCQs in batches, short answers, reading) and takes
> ~30–90s. This split keeps each response reliable and within Worker limits.

---

## Deploy to Cloudflare Workers

The project is already configured for Workers (`@sveltejs/adapter-cloudflare`,
`wrangler.jsonc`, `compatibility_flags: ["nodejs_als"]`).

1. **Build**

   ```sh
   yarn build
   ```

2. **Set secrets** (do NOT put secrets in `wrangler.jsonc`):

   ```sh
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   # optional
   npx wrangler secret put OPENAI_MODEL
   ```

3. **Deploy**

   ```sh
   npx wrangler deploy
   ```

Preview the production build locally with `yarn preview`.

### Is this Cloudflare-Workers-compatible? — Yes. Here's how it's handled

- **No Node-only APIs in the request path.** The OpenAI and Supabase SDKs are both
  `fetch`-based and run on the Workers runtime. We don't use `fs`, Node `crypto`, or Buffer
  parsing. UUIDs use the Web `crypto.randomUUID()`.
- **Secrets via `platform.env`, not `process.env`.** On Workers, secrets are bound onto
  `platform.env` at runtime — `process.env` doesn't exist. [`src/lib/server/env.ts`](src/lib/server/env.ts)
  reads from `platform.env` and only falls back to `process.env` when it exists (Node tooling),
  guarded by `typeof process !== 'undefined'`.
- **Local dev parity.** The Cloudflare adapter's platform proxy populates `platform.env`
  from `.dev.vars` during `yarn dev`, so the same code path works locally and in production.
- **Service-role key stays server-side.** It's only used inside `src/lib/server/**` (load
  functions, form actions, `+server.ts` endpoints) — never imported into client code.
- **Long generation calls** are split across multiple OpenAI requests. Awaiting external
  `fetch` doesn't burn Worker CPU time, and we stay well under subrequest limits (~4 calls).
- **File uploads** use the Web `FormData`/`File` APIs (`.text()`), supported on Workers.
  PDF parsing (which would need Node libs) is intentionally not included.

---

## Architecture

```
src/
  app.css                      Tailwind v4 + design tokens + light/dark
  app.html                     no-FOUC theme script + Inter font
  lib/
    theme.svelte.ts            theme store (runes)
    topics.ts                  default topics + difficulties
    format.ts                  date/percent helpers
    quiz-public.ts             strips the answer key before it reaches the browser
    types/quiz.ts              shared domain types
    components/                Button, Card, Badge, Nav, ThemeToggle, Markdown,
                               StatCard, Alert, EmptyState, PageHeader, QuizListItem,
                               quiz/* (taking), results/* (review)
    server/
      env.ts                   platform.env accessor + guards
      services.ts              build OpenAI + Supabase clients per request
      supabase/client.ts       service-role client factory
      supabase/repo.ts         all DB access
      ai/openai.ts             client + JSON call w/ zod validation + 1 repair retry
      ai/schemas.ts            zod schemas for AI output
      ai/prompts.ts            default prompts + Supabase override loader
      ai/context.ts            bounded source-material context builder
      ai/generate.ts           split MCQ/short-answer/reading generation
      ai/evaluate.ts           local MCQ grading + AI short-answer/weak-topic eval
      ai/summarize.ts          source-material summarization
  routes/                      pages + API endpoints (see table above)
supabase/migrations/0001_init.sql
```

### AI design notes

- **Generation is split** into multiple calls (MCQ batches of 15, short answers, reading)
  for reliability and to avoid truncation/timeouts. Counts are enforced in code (top-up
  loops guarantee 30 MCQs and ≥1 coding short-answer).
- **Structured JSON everywhere.** Each call uses `response_format: json_object`, is parsed,
  then validated with **zod**. On invalid output it retries once with a repair prompt before
  surfacing a clear error.
- **MCQs are graded locally** from the stored answer key — no AI tokens spent on grading.
  Only short answers + weak-topic analysis use the AI evaluator (one call, combining the
  `short_answer_evaluation` and `weak_topic_extraction` prompts).
- **Prompts are editable** at `/prompts` and stored in `prompt_settings`; missing rows fall
  back to the strong built-in defaults in `src/lib/server/ai/prompts.ts`.
- **No embeddings.** Per the project goals, source context uses stored summaries + bounded
  truncation rather than a vector store. This is simpler, cheaper, and good enough for a
  single user. Add embeddings later only if recall becomes a real problem.

---

## Notes on MCP relevance

- The repo ships a **Svelte MCP** server config (`.mcp.json`, `@sveltejs/mcp`). It's a
  *development-time* aid for editors/agents (live Svelte 5 + SvelteKit docs and a Svelte
  autofixer). It is **not** part of the deployed app and has no runtime role.
- This app does **not** expose or consume MCP at runtime. If you later want the quiz model
  to pull from external tools/data sources (e.g. a notes server, a finance data API), MCP
  would be a clean fit: add an MCP client under `src/lib/server/ai` and feed tool results
  into the generation context — but it's unnecessary for the current MVP.

---

## Scripts

```sh
yarn dev        # local dev server (reads .dev.vars)
yarn build      # production build (wrangler types check + vite build)
yarn preview    # preview the built Worker locally
yarn check      # svelte-check / type-check
yarn format     # prettier --write
```
#   d a i l y - q u i z  
 #   d a i l y - q u i z  
 