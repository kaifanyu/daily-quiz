# Labbook

A SvelteKit research notebook using the original Labbook design. Papers are the homepage, Concepts are freeform topic notes, Blogs are public posts, and Daily Quiz lives at `/daily-quiz`. Papers, concepts, and blogs are readable without an account; sign in only to write and manage content.

## Run locally

Use Node.js 24 and Yarn. Run `yarn install`, then `yarn dev --host 127.0.0.1`, or double-click `start-labbook.cmd`.

Local Vite development reads and saves `.labbook/library.json`, with `.labbook/library.backup.json` holding the previous save. The initial library was copied from `../Research/_Paper/data/library.json`; the original app and its data are preserved. The two local apps are separate copies after import, so continue editing in the integrated app or import a newer backup when switching.

`.labbook/` and `.dev.vars` are ignored by Git. Notes, PDFs, images, and owner credentials are never bundled into the public static assets. Development editing is enabled only on loopback hosts. Existing quiz services still require their Supabase and OpenAI settings.

## Notebook

- Papers: What it does, How it does it, and Results.
- Concepts: one freeform notes box.
- Markdown, inline/display LaTeX, equations, image upload/paste, and PDF attachments.
- Search, tags, sorting, collapsible sidebar, and Write / Split / Read modes.
- Autosave with revision conflicts, browser draft recovery, and JSON import/export.
- Public reading, owner-only editing. New paper/concept notes become public when saved to the hosted library.

## Blogs

`/blogs` lists public posts, and `/blogs/[id]` opens a reading view. Signed-in owners can create posts or select **Edit post** to use the existing rich-text editor. Images, lists, categories, and pinned posts are preserved.

Blogs reuse the existing `notes` database table, image storage, and `/api/notes` endpoints, so renaming the section does not move or erase your content. Old `/notes` links redirect to `/blogs`, including individual posts. Existing notes are now public blog posts.

## Hosted storage and owner access

This repo targets **Cloudflare Workers with static assets**, using `@sveltejs/adapter-cloudflare`. The webcam/live-stream feature, routes, and binding have been removed. Wrangler retains its original migration history and adds a deletion migration to retire the former Durable Object on the next deployment.

The hosted notebook uses the **same Supabase project as Daily Quiz**, in a separate `research_libraries` table. It keeps the full library document, including attachments, plus one previous version. A database function checks the expected revision and updates the library and backup atomically. The table and function are inaccessible to anonymous/browser database clients; all access passes through SvelteKit server routes.

Before deploying the new homepage:

1. Apply `supabase/migrations/0004_labbook.sql` in the existing project's Supabase SQL editor. It creates only the new library table and function; it does not modify quizzes or existing notes.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.dev.vars` for the import command. Keep the existing production Worker secrets of the same names. Never use a public/VITE-prefixed service-role key.
3. Validate and import the local library:

   ```powershell
   node scripts/import-labbook.mjs --file .labbook/library.json
   node scripts/import-labbook.mjs --file .labbook/library.json --apply
   ```

   The first command is a dry run with no network or writes. The second saves local backups of the source and remote library before uploading. It refuses to replace a nonempty remote library. To add newer notes to an existing hosted collection, use `--apply --merge`; changed versions are retained as separate entries. The source file is never modified.

4. Set `LABBOOK_ADMIN_PASSWORD` as a Worker secret, using a randomly generated password of at least 20 characters. A local password is configured in the ignored `.dev.vars` file. Store the chosen password in your password manager. Reading papers, concepts, and blogs is always public; editing requires the owner password.
5. Authenticate Wrangler, then run the checks and deploy through the existing pipeline or CLI:

   ```powershell
   yarn wrangler login
   yarn wrangler secret put LABBOOK_ADMIN_PASSWORD
   yarn run check
   yarn build
   yarn wrangler deploy
   ```

Use **Owner sign in** or open `/login` on the deployed site to edit. This is a single shared owner password, with no account registration, email provider, or separate authentication service. Sessions use a signed, secure, HTTP-only cookie and expire after 12 hours. Rotating the password invalidates prior sessions. **Sign out** returns to public reading.

The current checkout did not contain Supabase connection values and Wrangler was not signed in when this integration was prepared. The SQL migration and cloud import therefore need to be completed before publishing; the live site has not been changed.

To test against Supabase during Vite development, set `LABBOOK_STORAGE=cloud` in `.dev.vars`. This also enables the normal owner-login requirement. Production always uses Supabase and never the local file store.

## Checks

```powershell
yarn run check
node --test tests/*.test.mjs
yarn build
```

The import script requires Node.js 22.18 or newer for TypeScript loading; Node.js 24 is recommended. Database migrations and production data changes are separate from the build.
