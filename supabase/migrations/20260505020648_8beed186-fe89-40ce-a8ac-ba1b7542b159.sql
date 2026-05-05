CREATE OR REPLACE FUNCTION public.update_contact_with_provenance(
  p_contact_id uuid,
  p_fields jsonb,
  p_source text DEFAULT 'user',
  p_confidence smallint DEFAULT 100
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  k text;
  v text;
  v_user_id uuid;
  v_emails jsonb;
  v_phones jsonb;
BEGIN
  SELECT user_id, emails, phones INTO v_user_id, v_emails, v_phones
  FROM public.contacts WHERE id = p_contact_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'contact not found';
  END IF;

  UPDATE public.contacts
     SET full_name    = COALESCE(p_fields->>'full_name',    full_name),
         first_name   = COALESCE(p_fields->>'first_name',   first_name),
         last_name    = COALESCE(p_fields->>'last_name',    last_name),
         company      = COALESCE(p_fields->>'company',      company),
         title        = COALESCE(p_fields->>'title',        title),
         location     = COALESCE(p_fields->>'location',     location),
         linkedin_url = COALESCE(p_fields->>'linkedin_url', linkedin_url),
         twitter_url  = COALESCE(p_fields->>'twitter_url',  twitter_url),
         website_url  = COALESCE(p_fields->>'website_url',  website_url),
         photo_url    = COALESCE(p_fields->>'photo_url',    photo_url),
         emails = CASE
           WHEN p_fields ? 'email' AND COALESCE(p_fields->>'email','') <> ''
             AND NOT (v_emails ? (p_fields->>'email'))
           THEN COALESCE(v_emails,'[]'::jsonb) || to_jsonb(p_fields->>'email')
           ELSE emails END,
         phones = CASE
           WHEN p_fields ? 'phone' AND COALESCE(p_fields->>'phone','') <> ''
             AND NOT (v_phones ? (p_fields->>'phone'))
           THEN COALESCE(v_phones,'[]'::jsonb) || to_jsonb(p_fields->>'phone')
           ELSE phones END,
         updated_at = now()
   WHERE id = p_contact_id;

  FOR k, v IN SELECT * FROM jsonb_each_text(p_fields) LOOP
    IF v IS NULL OR v = '' THEN CONTINUE; END IF;

    UPDATE public.contact_field_sources
       SET is_active = false
     WHERE contact_id = p_contact_id
       AND field_name = k
       AND is_active = true;

    INSERT INTO public.contact_field_sources
      (contact_id, user_id, field_name, value, source, confidence, fetched_at, is_active)
    VALUES
      (p_contact_id, v_user_id, k, v, p_source, p_confidence, now(), true)
    ON CONFLICT (contact_id, field_name, source)
    DO UPDATE SET
      value = EXCLUDED.value,
      confidence = EXCLUDED.confidence,
      fetched_at = EXCLUDED.fetched_at,
      is_active = true;
  END LOOP;
END;
$$;