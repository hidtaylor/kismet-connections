
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  domain text,
  news_feed_url text,
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);
CREATE INDEX idx_companies_user ON public.companies(user_id);
CREATE INDEX idx_companies_user_name ON public.companies(user_id, lower(name));
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co own select" ON public.companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "co own insert" ON public.companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "co own update" ON public.companies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "co own delete" ON public.companies FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.company_field_sources (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  field_name text NOT NULL,
  value text,
  source text NOT NULL,
  confidence smallint NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT false,
  PRIMARY KEY (company_id, field_name, source)
);
CREATE INDEX idx_company_fs_active ON public.company_field_sources(company_id, field_name) WHERE is_active;
ALTER TABLE public.company_field_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cofs own select" ON public.company_field_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cofs own insert" ON public.company_field_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cofs own update" ON public.company_field_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cofs own delete" ON public.company_field_sources FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.company_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text,
  url text,
  url_normalized text,
  source_label text,
  before_value text,
  after_value text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  acted_on_at timestamptz,
  UNIQUE (company_id, url_normalized)
);
CREATE INDEX idx_company_events_open ON public.company_events(user_id, detected_at DESC) WHERE dismissed_at IS NULL;
ALTER TABLE public.company_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coev own select" ON public.company_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "coev own insert" ON public.company_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "coev own update" ON public.company_events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "coev own delete" ON public.company_events FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.contacts ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX idx_contacts_company ON public.contacts(company_id) WHERE company_id IS NOT NULL;

ALTER TABLE public.enrichment_jobs ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.enrichment_jobs ALTER COLUMN contact_id DROP NOT NULL;
ALTER TABLE public.enrichment_jobs ADD CONSTRAINT enrichment_jobs_target_chk
  CHECK ((contact_id IS NOT NULL)::int + (company_id IS NOT NULL)::int = 1);
CREATE INDEX idx_ej_company ON public.enrichment_jobs(company_id, created_at DESC) WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_active_company_value(p_company_id uuid, p_field_name text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT value FROM public.company_field_sources
  WHERE company_id = p_company_id AND field_name = p_field_name AND is_active
  ORDER BY confidence DESC, fetched_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.recompute_company_field_activation(p_company_id uuid, p_field_name text)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_winner_source text; v_winner_fetched timestamptz;
BEGIN
  SELECT source, fetched_at INTO v_winner_source, v_winner_fetched
  FROM public.company_field_sources
  WHERE company_id = p_company_id AND field_name = p_field_name
    AND value IS NOT NULL AND value <> ''
  ORDER BY CASE WHEN source = 'user' THEN 0 ELSE 1 END, confidence DESC, fetched_at DESC
  LIMIT 1;
  IF v_winner_source IS NULL THEN RETURN; END IF;
  UPDATE public.company_field_sources
    SET is_active = (source = v_winner_source AND fetched_at = v_winner_fetched)
    WHERE company_id = p_company_id AND field_name = p_field_name;
END;
$$;

CREATE OR REPLACE VIEW public.companies_resolved
WITH (security_invoker = true) AS
SELECT
  c.id, c.user_id, c.name, c.domain, c.news_feed_url, c.last_polled_at, c.created_at, c.updated_at,
  public.get_active_company_value(c.id, 'employee_count')      AS employee_count,
  public.get_active_company_value(c.id, 'industry')            AS industry,
  public.get_active_company_value(c.id, 'funding_stage')       AS funding_stage,
  public.get_active_company_value(c.id, 'last_funding_amount') AS last_funding_amount,
  public.get_active_company_value(c.id, 'location')            AS location,
  public.get_active_company_value(c.id, 'description')         AS description
FROM public.companies c;
