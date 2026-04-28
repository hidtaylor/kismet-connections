-- Per-user sync state for external integrations
CREATE TABLE public.sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  last_synced_at timestamptz,
  backfill_done_at timestamptz,
  cursor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ss own select" ON public.sync_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ss own insert" ON public.sync_state FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ss own update" ON public.sync_state FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ss own delete" ON public.sync_state FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_sync_state_updated_at
BEFORE UPDATE ON public.sync_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Calendar events staged for review
CREATE TYPE public.import_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.calendar_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'google_calendar',
  external_id text NOT NULL,
  calendar_id text,
  title text NOT NULL,
  description text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  organizer_email text,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  hangout_link text,
  status public.import_status NOT NULL DEFAULT 'pending',
  interaction_id uuid,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, external_id)
);

ALTER TABLE public.calendar_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ci own select" ON public.calendar_imports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ci own insert" ON public.calendar_imports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ci own update" ON public.calendar_imports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ci own delete" ON public.calendar_imports FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_calendar_imports_user_status_starts ON public.calendar_imports (user_id, status, starts_at DESC);

CREATE TRIGGER trg_calendar_imports_updated_at
BEFORE UPDATE ON public.calendar_imports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();