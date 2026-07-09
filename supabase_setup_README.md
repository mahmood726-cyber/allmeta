# RapidMeta Living-Meta — Supabase setup (manual steps)

This adds **user login + cross-device save-progress** to the RapidMeta living-meta
site (static GitHub Pages, repo `mahmood726-cyber/rapidmeta-finerenone`). The site
talks to Supabase **only** with the public project URL + publishable (anon) key,
gated by Row Level Security. No secret/service_role key is used anywhere.

- **Project URL:** `https://cfgywerxufcoutnplwhs.supabase.co`
- **Anon key:** embedded in `rapidmeta-auth.js` (safe to be public)
- **Live site:** https://mahmood726-cyber.github.io/rapidmeta-finerenone/

## What you must do in the Supabase dashboard (one-time)

### 1. Create the table + RLS policies
1. Open the project → **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase_setup.sql`](./supabase_setup.sql).
3. Click **Run**. This creates `public.living_meta_progress` (one row per user
   per app, holding a JSON state blob + `updated_at`) and RLS policies so each
   user can `SELECT/INSERT/UPDATE/DELETE` only their own rows (`auth.uid() = user_id`).

### 2. Enable the Google provider (for "Continue with Google")
1. **Authentication → Providers → Google → Enable**.
2. Add a Google OAuth client ID + secret (Google Cloud Console → APIs & Services
   → Credentials → OAuth client → *Web application*).
   - In the Google client, set **Authorized redirect URI** to:
     `https://cfgywerxufcoutnplwhs.supabase.co/auth/v1/callback`
3. Save. *(Email+password login works without this step; Google is optional.)*

### 3. Allow the GitHub Pages URL as a redirect target
1. **Authentication → URL Configuration**.
2. Set **Site URL** to: `https://mahmood726-cyber.github.io/rapidmeta-finerenone/`
3. Under **Redirect URLs**, add:
   - `https://mahmood726-cyber.github.io/rapidmeta-finerenone/**`
   This lets OAuth and email-confirmation links return to any app page.

### 4. (Optional) Email confirmation
By default Supabase requires email confirmation on sign-up. Either:
- Leave it on (users get a confirm email before they can log in), **or**
- **Authentication → Providers → Email → disable "Confirm email"** for frictionless
  testing.

## How it works
- `rapidmeta-auth.js` is loaded by every `*.html` app via one `<script>` tag.
- Logged-out users are unchanged — apps keep using `localStorage` locally.
- Logged-in users: the app's working state (the versioned `localStorage` the apps
  already autosave) is mirrored to Supabase on change (debounced) and via the
  **Save progress** button. On return, a toast offers to **Restore** it (writes the
  state back + reloads so the app rehydrates "where you left off"). State is keyed
  by `meta_app_id` = the app's filename, so each living meta saves independently.

## Verifying
After the SQL + provider steps, open any app on the live site (e.g.
`/FINERENONE_REVIEW.html`), sign up / log in, change something, click **Save
progress**, then reload (or open the same app on another device) → accept the
**Restore** toast.
