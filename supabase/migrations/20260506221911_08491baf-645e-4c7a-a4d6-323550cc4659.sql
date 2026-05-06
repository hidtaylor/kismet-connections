
REVOKE EXECUTE ON FUNCTION public.contacts_autolink_org() FROM authenticated;

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
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_name IS NULL AND v_domain IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid; RETURN;
  END IF;
  IF v_name IS NULL THEN
    v_name := regexp_replace(split_part(v_domain, '.', 1), '^www$', '');
    v_norm := public.normalize_company_name(v_name);
  END IF;

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
GRANT EXECUTE ON FUNCTION public.ensure_org_and_company(uuid, text, text) TO authenticated;
