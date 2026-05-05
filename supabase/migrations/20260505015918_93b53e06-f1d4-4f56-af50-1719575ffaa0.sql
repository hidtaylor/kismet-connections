-- Field-level provenance: every (contact, field, source) triple
CREATE TABLE public.contact_field_sources (
  contact_id  uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  field_name  text NOT NULL,
  value       text,
  source      text NOT NULL,
  confidence  smallint NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  is_active   boolean NOT NULL DEFAULT false,
  user_id     uuid NOT NULL,
  PRIMARY KEY (contact_id, field_name, source)
);
CREATE INDEX idx_cfs_active ON public.contact_field_sources (contact_id, field_name) WHERE is_active;
ALTER TABLE public.contact_field_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfs own select" ON public.contact_field_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cfs own insert" ON public.contact_field_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cfs own update" ON public.contact_field_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cfs own delete" ON public.contact_field_sources FOR DELETE USING (auth.uid() = user_id);

-- Identity aliases for entity resolution
CREATE TABLE public.contact_aliases (
  contact_id  uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  alias_type  text NOT NULL,
  alias_value text NOT NULL,
  source      text NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid NOT NULL,
  PRIMARY KEY (contact_id, alias_type, alias_value)
);
CREATE INDEX idx_ca_lookup ON public.contact_aliases (alias_type, alias_value);
ALTER TABLE public.contact_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ca own select" ON public.contact_aliases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ca own insert" ON public.contact_aliases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ca own update" ON public.contact_aliases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ca own delete" ON public.contact_aliases FOR DELETE USING (auth.uid() = user_id);

-- Enrichment job audit + idempotency
CREATE TABLE public.enrichment_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  contact_id     uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  match_key      text NOT NULL,
  request_hash   text NOT NULL,
  status         text NOT NULL DEFAULT 'queued',
  raw_response   jsonb,
  cost_cents     int,
  error_message  text,
  created_at     timestamptz DEFAULT now(),
  completed_at   timestamptz,
  UNIQUE (provider, request_hash)
);
CREATE INDEX idx_ej_contact ON public.enrichment_jobs (contact_id, created_at DESC);
ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ej own select" ON public.enrichment_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ej own insert" ON public.enrichment_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ej own update" ON public.enrichment_jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ej own delete" ON public.enrichment_jobs FOR DELETE USING (auth.uid() = user_id);

-- Social graph edges
CREATE TABLE public.contact_edges (
  user_id      uuid NOT NULL,
  from_contact uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  to_contact   uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  edge_type    text NOT NULL,
  strength     smallint NOT NULL CHECK (strength BETWEEN 0 AND 100),
  evidence     jsonb NOT NULL,
  detected_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, from_contact, to_contact, edge_type)
);
CREATE INDEX idx_ce_from ON public.contact_edges (user_id, from_contact);
CREATE INDEX idx_ce_to ON public.contact_edges (user_id, to_contact);
ALTER TABLE public.contact_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ce own select" ON public.contact_edges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ce own insert" ON public.contact_edges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ce own update" ON public.contact_edges FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ce own delete" ON public.contact_edges FOR DELETE USING (auth.uid() = user_id);