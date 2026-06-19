/* shared/alm-auth-config.js — RapidMeta/allmeta accounts configuration.
 *
 * Accounts + cross-device sync are OFF until this file is filled in. Until then,
 * every app still works and autosaves to the CURRENT BROWSER ONLY (per-device,
 * per-browser localStorage) — which the UI states honestly.
 *
 * To turn on accounts (GitHub/Google OAuth + email-password, with per-user cloud
 * storage that works across devices), follow docs/AUTH_SETUP.md and then replace
 * the null below with your Supabase project's PUBLIC values:
 *
 *   window.ALM_AUTH_CONFIG = {
 *     url:     "https://YOURPROJECT.supabase.co",  // Project URL
 *     anonKey: "eyJhbGci...",                       // the PUBLIC anon key only
 *     table:   "workspace"                          // created by the setup SQL
 *   };
 *
 * The anon key is designed to be public (Row-Level Security restricts each user
 * to their own row) — it is NOT a secret. NEVER put the service_role key here.
 */
window.ALM_AUTH_CONFIG = null;
