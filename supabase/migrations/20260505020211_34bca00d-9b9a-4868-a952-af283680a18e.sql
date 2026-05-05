CREATE OR REPLACE FUNCTION public.get_active_contact_value(p_contact_id uuid, p_field_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT value
  FROM public.contact_field_sources
  WHERE contact_id = p_contact_id
    AND field_name = p_field_name
    AND is_active
  ORDER BY confidence DESC, fetched_at DESC
  LIMIT 1
$$;