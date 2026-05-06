
-- 1. Add domain to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS domain text;
CREATE INDEX IF NOT EXISTS organizations_user_domain_idx ON public.organizations(user_id, domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS organizations_user_name_idx ON public.organizations(user_id, lower(name));
CREATE INDEX IF NOT EXISTS companies_user_name_idx ON public.companies(user_id, lower(name));

-- 2. Helpers
CREATE OR REPLACE FUNCTION public.normalize_company_name(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(trim(regexp_replace(
    regexp_replace(
      regexp_replace(coalesce(p_name,''), '[,.]', ' ', 'g'),
      '\m(inc|incorporated|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|gmbh|sa|ag|plc|pty)\M\.?',
      '', 'gi'),
    '\s+', ' ', 'g')))
$$;

CREATE OR REPLACE FUNCTION public.domain_from_email(p_email text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d text;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN RETURN NULL; END IF;
  d := lower(split_part(p_email, '@', 2));
  IF d = '' THEN RETURN NULL; END IF;
  IF d IN ('gmail.com','outlook.com','hotmail.com','yahoo.com','icloud.com','me.com','live.com','aol.com','proton.me','protonmail.com') THEN
    RETURN NULL;
  END IF;
  RETURN d;
END;
$$;

-- 3. ensure_org_and_company RPC
CREATE OR REPLACE FUNCTION public.ensure_org_and_company(
  p_user_id uuid, p_name text, p_email text DEFAULT NULL
) RETURNS TABLE(organization_id uuid, company_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_domain text := public.domain_from_email(p_email);
  v_norm text := public.normalize_company_name(p_name);
  v_name text := nullif(trim(coalesce(p_name,'')), '');
  v_org uuid;
  v_co uuid;
BEGIN
  IF v_name IS NULL AND v_domain IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid; RETURN;
  END IF;
  IF v_name IS NULL THEN
    v_name := regexp_replace(split_part(v_domain, '.', 1), '^www$', '');
    v_norm := public.normalize_company_name(v_name);
  END IF;

  -- organization
  IF v_domain IS NOT NULL THEN
    SELECT id INTO v_org FROM public.organizations
      WHERE user_id = p_user_id AND domain = v_domain LIMIT 1;
  END IF;
  IF v_org IS NULL AND v_norm <> '' THEN
    SELECT id INTO v_org FROM public.organizations
      WHERE user_id = p_user_id AND public.normalize_company_name(name) = v_norm LIMIT 1;
  END IF;
  IF v_org IS NULL THEN
    INSERT INTO public.organizations (user_id, name, domain, kind)
      VALUES (p_user_id, v_name, v_domain, 'other')
      RETURNING id INTO v_org;
  ELSIF v_domain IS NOT NULL THEN
    UPDATE public.organizations SET domain = v_domain
      WHERE id = v_org AND domain IS NULL;
  END IF;

  -- company (mirror)
  IF v_domain IS NOT NULL THEN
    SELECT id INTO v_co FROM public.companies
      WHERE user_id = p_user_id AND domain = v_domain LIMIT 1;
  END IF;
  IF v_co IS NULL AND v_norm <> '' THEN
    SELECT id INTO v_co FROM public.companies
      WHERE user_id = p_user_id AND public.normalize_company_name(name) = v_norm LIMIT 1;
  END IF;
  IF v_co IS NULL THEN
    INSERT INTO public.companies (user_id, name, domain)
      VALUES (p_user_id, v_name, v_domain)
      RETURNING id INTO v_co;
  ELSIF v_domain IS NOT NULL THEN
    UPDATE public.companies SET domain = v_domain
      WHERE id = v_co AND domain IS NULL;
  END IF;

  RETURN QUERY SELECT v_org, v_co;
END;
$$;

-- 4. Backfill
DO $$
DECLARE r record; v_org uuid; v_co uuid; v_email text;
BEGIN
  -- Contacts with company text
  FOR r IN
    SELECT id, user_id, company, emails FROM public.contacts
    WHERE (organization_id IS NULL OR company_id IS NULL)
      AND coalesce(trim(company), '') <> ''
  LOOP
    v_email := NULL;
    IF jsonb_typeof(r.emails) = 'array' AND jsonb_array_length(r.emails) > 0 THEN
      v_email := r.emails->>0;
    END IF;
    SELECT eo.organization_id, eo.company_id
      INTO v_org, v_co
      FROM public.ensure_org_and_company(r.user_id, r.company, v_email) eo;
    UPDATE public.contacts
      SET organization_id = COALESCE(organization_id, v_org),
          company_id = COALESCE(company_id, v_co)
      WHERE id = r.id;
  END LOOP;

  -- Mirror existing organizations -> companies
  FOR r IN SELECT id, user_id, name, domain FROM public.organizations LOOP
    SELECT eo.company_id INTO v_co
      FROM public.ensure_org_and_company(r.user_id, r.name, NULL) eo;
  END LOOP;

  -- Mirror existing companies -> organizations
  FOR r IN SELECT id, user_id, name, domain FROM public.companies LOOP
    SELECT eo.organization_id INTO v_org
      FROM public.ensure_org_and_company(r.user_id, r.name, NULL) eo;
  END LOOP;
END $$;

-- 5. Trigger to auto-link on contact insert/update
CREATE OR REPLACE FUNCTION public.contacts_autolink_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_org uuid; v_co uuid;
BEGIN
  IF coalesce(trim(NEW.company), '') = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_email := NULL;
  IF jsonb_typeof(NEW.emails) = 'array' AND jsonb_array_length(NEW.emails) > 0 THEN
    v_email := NEW.emails->>0;
  END IF;
  SELECT eo.organization_id, eo.company_id INTO v_org, v_co
    FROM public.ensure_org_and_company(NEW.user_id, NEW.company, v_email) eo;
  NEW.organization_id := COALESCE(NEW.organization_id, v_org);
  NEW.company_id := COALESCE(NEW.company_id, v_co);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_autolink_org_trg ON public.contacts;
CREATE TRIGGER contacts_autolink_org_trg
  BEFORE INSERT OR UPDATE OF company, emails, organization_id, company_id ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_autolink_org();
