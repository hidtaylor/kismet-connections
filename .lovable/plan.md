## Fix the blank published site

The published site crashes with `Error: supabaseUrl is required` because there's no `.env` file in the project, so the Vite build inlines `undefined` for `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The dev preview works only because those values exist as shell env vars in the sandbox.

The Supabase URL and anon key are public values (protected by RLS) and safe to ship in the client bundle.

### Steps

1. **Create `src/integrations/supabase/env.ts`** — exports `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, reading from `import.meta.env` first and falling back to the known public values for this project.

2. **Replace `src/integrations/supabase/client.ts`** — import the constants from `./env` instead of reading `import.meta.env` directly. The file is normally auto-generated, but since regeneration isn't happening here, editing it is the correct fix.

3. **Republish** — after the change, the publish dialog will show a real diff (no longer "up to date"), so clicking Publish → Update will produce a fresh bundle that loads correctly at `https://kismet-connections.lovable.app`.
