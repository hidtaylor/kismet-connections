
CREATE OR REPLACE FUNCTION public.recompute_field_activation(p_contact_id uuid, p_field_name text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_winner_source text;
  v_winner_fetched timestamptz;
BEGIN
  -- Pick winner: user source if present, else highest confidence, ties by fetched_at desc
  SELECT source, fetched_at
    INTO v_winner_source, v_winner_fetched
  FROM public.contact_field_sources
  WHERE contact_id = p_contact_id
    AND field_name = p_field_name
    AND value IS NOT NULL
    AND value <> ''
  ORDER BY
    CASE WHEN source = 'user' THEN 0 ELSE 1 END,
    confidence DESC,
    fetched_at DESC
  LIMIT 1;

  IF v_winner_source IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.contact_field_sources
     SET is_active = (source = v_winner_source AND fetched_at = v_winner_fetched)
   WHERE contact_id = p_contact_id
     AND field_name = p_field_name;
END;
$$;
