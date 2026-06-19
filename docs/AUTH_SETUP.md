# RapidMeta / allmeta — accounts + cross-device persistence (setup)

These apps are **static** (GitHub Pages). On their own they save your work to
`localStorage`, which is **per-browser and per-device** — it survives reloads in
the same browser, but it is *not* an account and does *not* follow you to another
computer. The UI now says this honestly ("💾 This browser only").

To give users real accounts (GitHub / Google OAuth **or** email + password) with
per-user storage that works across devices, connect a **Supabase** project. The
client (`shared/alm-auth.js`) talks to Supabase's REST endpoints with plain
`fetch` — no SDK, no CDN — so it works on a static host. There is **one** thing
you must do: create the project and paste its **public** values into
`shared/alm-auth-config.js`.

## Why Supabase (vs. pure client-side)

| Option | Cross-device? | OAuth | Email+pw | Secrets in static site? |
|---|---|---|---|---|
| localStorage only (today's fallback) | ❌ no — per browser | – | – | none |
| **Supabase (recommended)** | ✅ yes | ✅ GitHub/Google | ✅ | **none** — only the *public* anon key, protected by Row-Level Security |
| Firebase | ✅ yes | ✅ | ✅ | only public web config |

Supabase is recommended: one backend covers OAuth *and* email/password, the free
tier is enough, and the **anon key is public by design** (RLS enforces that each
user can read/write only their own row). **Never** put the `service_role` key in
the site.

## One-time setup (≈10 minutes)

1. Create a free project at <https://supabase.com>. Note the **Project URL** and
   the **anon public** key (Project Settings → API). *(Do not copy the
   service_role key anywhere near the front end.)*

2. In the SQL editor, run:

   ```sql
   create table if not exists public.workspace (
     user_id    uuid primary key references auth.users(id) on delete cascade,
     data       jsonb not null default '{}'::jsonb,
     updated_at timestamptz not null default now()
   );
   alter table public.workspace enable row level security;

   create policy "own row read"   on public.workspace for select using (auth.uid() = user_id);
   create policy "own row insert" on public.workspace for insert with check (auth.uid() = user_id);
   create policy "own row update" on public.workspace for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```

3. **Auth → Providers**: enable GitHub and/or Google (create an OAuth app with
   each provider and paste its client id/secret into Supabase). Email is on by
   default. Optionally turn off "Confirm email" for a frictionless email/password
   flow during testing.

4. **Auth → URL Configuration**: add your site origin(s) to **Redirect URLs**,
   e.g. `https://YOURNAME.github.io/allmeta/` and every app path you enable auth
   on (`.../allmeta/screen/`, `/extract/`, `/paper/`). OAuth returns the token in
   the URL hash to whichever page started the sign-in.

5. Edit **`shared/alm-auth-config.js`**:

   ```js
   window.ALM_AUTH_CONFIG = {
     url:     "https://YOURPROJECT.supabase.co",
     anonKey: "eyJhbGciOi...",   // anon PUBLIC key only
     table:   "workspace"
   };
   ```

That's it. The "💾 This browser only" badge becomes "🔐 Sign in to save", and after
sign-in "✓ you@example — Synced ✓".

## What syncs

The per-user row stores these workspace keys (raw value + last-changed time, so
the newest edit wins on merge): `sr-project-v1`, `sr-records-v1`, `screen-v1`,
`ma-studies-v1`, `ma-pooled-v1`, `rapidmeta.paperState`, `grade-sof-v1`,
`rob-assess-v1` — i.e. **screening include/exclude decisions, data extractions,
and Paper Studio writing**.

On sign-in the app pulls the cloud copy, merges newest-wins, and reloads so each
stage re-reads the restored data. Edits are pushed (debounced) and flushed on tab
hide/close.

## Limits / honesty

- **Conflict policy is last-write-wins per key.** If the *same key* is edited on
  two devices while both are offline, the later push wins for that key. Fine for a
  single user across their own devices; it is not real-time co-editing.
- If the backend is unreachable, work still saves locally and the badge shows a
  sync error; it pushes again on the next change/load.
- Without the config above, nothing is sent anywhere — local-only, clearly
  labelled.
