-- 2a. Notes provenance + sensitivity
CREATE TYPE public.note_provenance AS ENUM ('fact','user_memory','ai_summary','ai_inference','recommendation');
CREATE TYPE public.note_sensitivity AS ENUM ('normal','sensitive','private');

ALTER TABLE public.notes
  ADD COLUMN provenance public.note_provenance NOT NULL DEFAULT 'user_memory',
  ADD COLUMN sensitivity public.note_sensitivity NOT NULL DEFAULT 'normal',
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN confirmed_at TIMESTAMPTZ,
  ADD COLUMN source_interaction_id UUID REFERENCES public.interactions(id) ON DELETE SET NULL;

UPDATE public.notes SET confirmed_at = created_at WHERE confirmed_at IS NULL;

CREATE INDEX idx_notes_provenance ON public.notes(user_id, provenance);
CREATE INDEX idx_notes_sensitivity ON public.notes(user_id, sensitivity) WHERE sensitivity != 'normal';

-- 2b. suggested_memories
CREATE TYPE public.suggested_memory_status AS ENUM ('pending','accepted','rejected');

CREATE TABLE public.suggested_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  source_interaction_id UUID REFERENCES public.interactions(id) ON DELETE CASCADE,
  body_md TEXT NOT NULL,
  suggested_provenance public.note_provenance NOT NULL DEFAULT 'ai_inference',
  suggested_sensitivity public.note_sensitivity NOT NULL DEFAULT 'normal',
  status public.suggested_memory_status NOT NULL DEFAULT 'pending',
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
ALTER TABLE public.suggested_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sm own select" ON public.suggested_memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sm own insert" ON public.suggested_memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sm own update" ON public.suggested_memories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sm own delete" ON public.suggested_memories FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_sm_user_status ON public.suggested_memories(user_id, status, created_at DESC);

-- 2c. Graph schema
CREATE TYPE public.org_kind AS ENUM ('brokerage','association','vendor','portal','mls','startup','other');
CREATE TYPE public.event_kind AS ENUM ('conference','panel','dinner','internal','webinar','other');
CREATE TYPE public.node_kind AS ENUM ('person','org','event','topic');
CREATE TYPE public.edge_kind AS ENUM (
  'knows','worked_with','introduced_by','family','mentor','mentee',
  'works_at','formerly_at','advisor','board','founder','client',
  'attended','spoke_at','hosted',
  'expert_in','interested_in',
  'parent_of','subsidiary_of','partner_of','competitor_of',
  'sponsored','co_attended','met_with','co_thread'
);
CREATE TYPE public.edge_confidence AS ENUM ('confirmed','inferred','suggested');

CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  kind public.org_kind NOT NULL DEFAULT 'other',
  website TEXT,
  parent_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  logo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org own select" ON public.organizations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "org own insert" ON public.organizations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "org own update" ON public.organizations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "org own delete" ON public.organizations FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_org_user_id ON public.organizations(user_id);
CREATE TRIGGER trg_org_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  kind public.event_kind NOT NULL DEFAULT 'other',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  location TEXT,
  host_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ev own select" ON public.events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ev own insert" ON public.events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ev own update" ON public.events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ev own delete" ON public.events FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_ev_user_id ON public.events(user_id);
CREATE TRIGGER trg_ev_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tp own select" ON public.topics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tp own insert" ON public.topics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tp own update" ON public.topics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tp own delete" ON public.topics FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_tp_user_id ON public.topics(user_id);

CREATE TABLE public.graph_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind public.node_kind NOT NULL,
  ref_table TEXT NOT NULL,
  ref_id UUID NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref_table, ref_id)
);
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gn own select" ON public.graph_nodes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "gn own insert" ON public.graph_nodes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "gn own update" ON public.graph_nodes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "gn own delete" ON public.graph_nodes FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_gn_user_kind ON public.graph_nodes(user_id, kind);
CREATE INDEX idx_gn_ref ON public.graph_nodes(user_id, ref_table, ref_id);

CREATE TABLE public.graph_edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_node_id UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  kind public.edge_kind NOT NULL,
  strength_score INT NOT NULL DEFAULT 0 CHECK (strength_score BETWEEN 0 AND 100),
  strength_override INT CHECK (strength_override BETWEEN 0 AND 100),
  confidence public.edge_confidence NOT NULL DEFAULT 'inferred',
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_node_id, target_node_id, kind)
);
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ge own select" ON public.graph_edges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ge own insert" ON public.graph_edges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ge own update" ON public.graph_edges FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ge own delete" ON public.graph_edges FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_ge_source ON public.graph_edges(user_id, source_node_id);
CREATE INDEX idx_ge_target ON public.graph_edges(user_id, target_node_id);
CREATE INDEX idx_ge_strength ON public.graph_edges(user_id, strength_score DESC);
CREATE TRIGGER trg_ge_updated_at BEFORE UPDATE ON public.graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2d. Contacts org link
ALTER TABLE public.contacts
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX idx_contacts_organization_id ON public.contacts(organization_id) WHERE organization_id IS NOT NULL;

-- 2e. Graph node sync
CREATE OR REPLACE FUNCTION public.sync_graph_node()
RETURNS TRIGGER AS $$
DECLARE
  v_kind public.node_kind;
  v_label TEXT;
BEGIN
  IF TG_TABLE_NAME = 'contacts' THEN
    v_kind := 'person'; v_label := NEW.full_name;
  ELSIF TG_TABLE_NAME = 'organizations' THEN
    v_kind := 'org'; v_label := NEW.name;
  ELSIF TG_TABLE_NAME = 'events' THEN
    v_kind := 'event'; v_label := NEW.name;
  ELSIF TG_TABLE_NAME = 'topics' THEN
    v_kind := 'topic'; v_label := NEW.name;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.graph_nodes (user_id, kind, ref_table, ref_id, label)
  VALUES (NEW.user_id, v_kind, TG_TABLE_NAME, NEW.id, v_label)
  ON CONFLICT (user_id, ref_table, ref_id)
  DO UPDATE SET label = EXCLUDED.label;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.sync_graph_node() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_sync_node_contacts
  AFTER INSERT OR UPDATE OF full_name ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_graph_node();
CREATE TRIGGER trg_sync_node_orgs
  AFTER INSERT OR UPDATE OF name ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.sync_graph_node();
CREATE TRIGGER trg_sync_node_events
  AFTER INSERT OR UPDATE OF name ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.sync_graph_node();
CREATE TRIGGER trg_sync_node_topics
  AFTER INSERT OR UPDATE OF name ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.sync_graph_node();

INSERT INTO public.graph_nodes (user_id, kind, ref_table, ref_id, label)
SELECT user_id, 'person'::public.node_kind, 'contacts', id, full_name
FROM public.contacts
ON CONFLICT (user_id, ref_table, ref_id) DO NOTHING;

-- 2f. Recordings external transcripts
ALTER TABLE public.recordings
  ADD COLUMN source_provider TEXT,
  ADD COLUMN source_external_id TEXT,
  ADD COLUMN external_url TEXT,
  ALTER COLUMN storage_path DROP NOT NULL;

CREATE UNIQUE INDEX idx_rec_external ON public.recordings(user_id, source_provider, source_external_id)
  WHERE source_external_id IS NOT NULL;