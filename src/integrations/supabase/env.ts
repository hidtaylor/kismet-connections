// Resolves Supabase connection values with a public-fallback so the
// production bundle never crashes when build-time env vars are missing.
// The URL and anon key are public values protected by RLS — safe to ship.

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://vdshiynolrrqmjkwbexl.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkc2hpeW5vbHJycW1qa3diZXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODkyNDEsImV4cCI6MjA5Mjk2NTI0MX0.Bn5idRcUyz3Pf5VxJPaky54D_ZbNQgND5ypXs9ADfwM";
