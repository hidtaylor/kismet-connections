
-- Enable pgvector extension for future semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- ============= ENUMS =============
CREATE TYPE public.cadence_type AS ENUM ('close', 'monthly', 'quarterly', 'annual', 'none');
CREATE TYPE public.contact_source AS ENUM ('card_scan', 'calendar', 'email', 'manual');
CREATE TYPE public.interaction_type AS ENUM ('in_person', 'call', 'video', 'email', 'conference', 'other');
CREATE TYPE public.transcript_status AS ENUM ('pending', 'processing', 'done', 'failed');
CREATE TYPE public.scan_status AS ENUM ('pending', 'parsed', 'confirmed', 'discarded');

-- ============= updated_at trigger function =============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  audio_retention_days INT NOT NULL DEFAULT 0, -- 0 = forever
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= CONTACTS =============
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  title TEXT,
  emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  phones JSONB NOT NULL DEFAULT '[]'::jsonb,
  photo_url TEXT,
  linkedin_url TEXT,
  twitter_url TEXT,
  website_url TEXT,
  location TEXT,
  cadence public.cadence_type NOT NULL DEFAULT 'none',
  last_contact_at TIMESTAMPTZ,
  source public.contact_source NOT NULL DEFAULT 'manual',
  notes_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts own select" ON public.contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "contacts own insert" ON public.contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contacts own update" ON public.contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "contacts own delete" ON public.contacts FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX idx_contacts_last_contact_at ON public.contacts(user_id, last_contact_at DESC NULLS LAST);
CREATE INDEX idx_contacts_fts ON public.contacts USING GIN (
  to_tsvector('english', coalesce(full_name,'') || ' ' || coalesce(company,'') || ' ' || coalesce(title,''))
);

-- ============= INTERACTIONS =============
CREATE TABLE public.interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  type public.interaction_type NOT NULL DEFAULT 'other',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  location TEXT,
  summary TEXT,
  source_provider TEXT,
  source_external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interactions own select" ON public.interactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "interactions own insert" ON public.interactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "interactions own update" ON public.interactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "interactions own delete" ON public.interactions FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_interactions_user_id ON public.interactions(user_id);
CREATE INDEX idx_interactions_occurred_at ON public.interactions(user_id, occurred_at DESC);
CREATE INDEX idx_interactions_summary_fts ON public.interactions USING GIN (
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,''))
);

-- ============= INTERACTION_CONTACTS =============
CREATE TABLE public.interaction_contacts (
  interaction_id UUID NOT NULL REFERENCES public.interactions(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  PRIMARY KEY (interaction_id, contact_id)
);
ALTER TABLE public.interaction_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ic own select" ON public.interaction_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ic own insert" ON public.interaction_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ic own delete" ON public.interaction_contacts FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_ic_user_id ON public.interaction_contacts(user_id);
CREATE INDEX idx_ic_contact ON public.interaction_contacts(contact_id);

-- ============= NOTES =============
CREATE TABLE public.notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  interaction_id UUID REFERENCES public.interactions(id) ON DELETE CASCADE,
  body_md TEXT NOT NULL DEFAULT '',
  voice_url TEXT,
  transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes own select" ON public.notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notes own insert" ON public.notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notes own update" ON public.notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notes own delete" ON public.notes FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_notes_user_id ON public.notes(user_id);
CREATE INDEX idx_notes_contact_id ON public.notes(contact_id);
CREATE INDEX idx_notes_interaction_id ON public.notes(interaction_id);
CREATE INDEX idx_notes_fts ON public.notes USING GIN (
  to_tsvector('english', coalesce(body_md,'') || ' ' || coalesce(transcript,''))
);

-- ============= RECORDINGS =============
CREATE TABLE public.recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  interaction_id UUID REFERENCES public.interactions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  duration_seconds INT,
  transcript_text TEXT,
  transcript_status public.transcript_status NOT NULL DEFAULT 'pending',
  consent_disclosed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec own select" ON public.recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "rec own insert" ON public.recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rec own update" ON public.recordings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "rec own delete" ON public.recordings FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_rec_user_id ON public.recordings(user_id);
CREATE INDEX idx_rec_interaction_id ON public.recordings(interaction_id);
CREATE INDEX idx_rec_transcript_fts ON public.recordings USING GIN (to_tsvector('english', coalesce(transcript_text,'')));

-- ============= CARD_SCANS =============
CREATE TABLE public.card_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  ocr_json JSONB,
  parsed_json JSONB,
  status public.scan_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.card_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs own select" ON public.card_scans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cs own insert" ON public.card_scans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cs own update" ON public.card_scans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cs own delete" ON public.card_scans FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_cs_user_id ON public.card_scans(user_id);

-- ============= TAGS =============
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags own select" ON public.tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tags own insert" ON public.tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tags own update" ON public.tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tags own delete" ON public.tags FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_tags_user_id ON public.tags(user_id);

-- ============= CONTACT_TAGS =============
CREATE TABLE public.contact_tags (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  PRIMARY KEY (contact_id, tag_id)
);
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct own select" ON public.contact_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ct own insert" ON public.contact_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ct own delete" ON public.contact_tags FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_ct_user_id ON public.contact_tags(user_id);

-- ============= EMBEDDINGS (placeholder for phase 2 semantic search) =============
CREATE TABLE public.embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_type TEXT NOT NULL, -- 'contact' | 'note' | 'interaction' | 'recording'
  source_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emb own select" ON public.embeddings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "emb own insert" ON public.embeddings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "emb own delete" ON public.embeddings FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_emb_user_id ON public.embeddings(user_id);

-- ============= STORAGE BUCKETS =============
INSERT INTO storage.buckets (id, name, public) VALUES ('recordings', 'recordings', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('card-images', 'card-images', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('contact-photos', 'contact-photos', false) ON CONFLICT DO NOTHING;

-- Storage policies — files stored under {user_id}/...
CREATE POLICY "recordings own select" ON storage.objects FOR SELECT
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "recordings own insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "recordings own update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "recordings own delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cards own select" ON storage.objects FOR SELECT
  USING (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "cards own insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "cards own update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "cards own delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "photos own select" ON storage.objects FOR SELECT
  USING (bucket_id = 'contact-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "photos own insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'contact-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "photos own update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'contact-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "photos own delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'contact-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
