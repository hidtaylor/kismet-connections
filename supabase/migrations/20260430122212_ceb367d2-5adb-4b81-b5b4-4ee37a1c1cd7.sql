DROP FUNCTION IF EXISTS public.recompute_graph_strength(uuid);

CREATE FUNCTION public.recompute_graph_strength(p_user_id uuid)
RETURNS TABLE(
  edges_scored integer,
  orgs_scored integer,
  pairs_computed integer,
  max_raw numeric,
  max_score integer
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_person_count INT := 0;
  v_org_count INT := 0;
  v_pairs INT := 0;
  v_max_raw NUMERIC := 0;
  v_max_score INT := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  CREATE TEMP TABLE _pair_scores ON COMMIT DROP AS
  SELECT
    ic1.user_id,
    gn1.id AS source_node_id,
    gn2.id AS target_node_id,
    SUM(
      (CASE i.type::text
        WHEN 'in_person'  THEN 10::numeric
        WHEN 'video'      THEN 5::numeric
        WHEN 'call'       THEN 3::numeric
        WHEN 'email'      THEN 1::numeric
        WHEN 'conference' THEN 2::numeric
        ELSE 1::numeric
      END)
      * ln(1 + COALESCE(EXTRACT(EPOCH FROM (i.ended_at - i.occurred_at)) / 60.0, 30))
      * GREATEST(
          exp(- EXTRACT(EPOCH FROM (now() - i.occurred_at)) / (180.0 * 86400.0)),
          0.05
        )
    )::numeric AS raw_score
  FROM public.interaction_contacts ic1
  JOIN public.interaction_contacts ic2
    ON ic2.interaction_id = ic1.interaction_id
   AND ic2.user_id        = ic1.user_id
   AND ic2.contact_id    <> ic1.contact_id
  JOIN public.interactions i
    ON i.id = ic1.interaction_id
  JOIN public.graph_nodes gn1
    ON gn1.user_id = ic1.user_id AND gn1.ref_table = 'contacts' AND gn1.ref_id = ic1.contact_id
  JOIN public.graph_nodes gn2
    ON gn2.user_id = ic2.user_id AND gn2.ref_table = 'contacts' AND gn2.ref_id = ic2.contact_id
  WHERE ic1.user_id = p_user_id
  GROUP BY ic1.user_id, gn1.id, gn2.id;

  SELECT COUNT(*), COALESCE(MAX(raw_score), 0)
    INTO v_pairs, v_max_raw
    FROM _pair_scores;

  IF v_pairs > 0 AND v_max_raw > 0 THEN
    UPDATE public.graph_edges ge
    SET strength_score = LEAST(100, GREATEST(0, ROUND((ps.raw_score / v_max_raw) * 100)))::int,
        updated_at = now()
    FROM _pair_scores ps
    WHERE ge.user_id        = p_user_id
      AND ge.source_node_id = ps.source_node_id
      AND ge.target_node_id = ps.target_node_id
      AND ge.kind IN ('met_with','co_thread','co_attended','knows','worked_with');

    GET DIAGNOSTICS v_person_count = ROW_COUNT;
  END IF;

  CREATE TEMP TABLE _person_warmth ON COMMIT DROP AS
  SELECT source_node_id AS person_node, MAX(strength_score) AS warmth
  FROM public.graph_edges
  WHERE user_id = p_user_id
    AND kind IN ('met_with','co_thread','co_attended')
  GROUP BY source_node_id;

  CREATE TEMP TABLE _org_scores ON COMMIT DROP AS
  WITH org_rollup AS (
    SELECT
      ge.source_node_id AS person_node,
      ge.target_node_id AS org_node,
      CASE ge.kind::text
        WHEN 'works_at'    THEN 1.0
        WHEN 'advisor'     THEN 0.8
        WHEN 'board'       THEN 0.8
        WHEN 'founder'     THEN 0.8
        WHEN 'formerly_at' THEN 0.3
        ELSE 0.5
      END AS aff_weight
    FROM public.graph_edges ge
    WHERE ge.user_id = p_user_id
      AND ge.kind IN ('works_at','formerly_at','advisor','board','founder')
  )
  SELECT
    org_rollup.org_node,
    ln(1 + SUM(COALESCE(pw.warmth, 10) * org_rollup.aff_weight))::numeric AS raw
  FROM org_rollup
  LEFT JOIN _person_warmth pw ON pw.person_node = org_rollup.person_node
  GROUP BY org_rollup.org_node;

  IF (SELECT COUNT(*) FROM _org_scores) > 0 THEN
    UPDATE public.graph_edges ge
    SET strength_score = LEAST(100, GREATEST(0, ROUND((os.raw / GREATEST((SELECT MAX(raw) FROM _org_scores), 0.0001)) * 100)))::int,
        updated_at = now()
    FROM _org_scores os
    WHERE ge.user_id = p_user_id
      AND ge.target_node_id = os.org_node
      AND ge.kind IN ('works_at','formerly_at','advisor','board','founder');

    GET DIAGNOSTICS v_org_count = ROW_COUNT;
  END IF;

  SELECT COALESCE(MAX(strength_score), 0) INTO v_max_score
    FROM public.graph_edges
    WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_person_count, v_org_count, v_pairs, v_max_raw, v_max_score;
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_graph_strength(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_graph_strength(uuid) TO authenticated;

-- Backfill organization_id on contacts from free-text company.
WITH to_link AS (
  SELECT DISTINCT c.user_id, btrim(c.company) AS company_name
  FROM public.contacts c
  WHERE c.organization_id IS NULL
    AND c.company IS NOT NULL
    AND btrim(c.company) <> ''
),
existing AS (
  SELECT tl.user_id, tl.company_name, o.id AS org_id
  FROM to_link tl
  JOIN public.organizations o
    ON o.user_id = tl.user_id
   AND lower(o.name) = lower(tl.company_name)
),
to_create AS (
  SELECT tl.user_id, tl.company_name
  FROM to_link tl
  WHERE NOT EXISTS (
    SELECT 1 FROM existing e
    WHERE e.user_id = tl.user_id AND e.company_name = tl.company_name
  )
),
created AS (
  INSERT INTO public.organizations (user_id, name, kind)
  SELECT user_id, company_name, 'other'::org_kind FROM to_create
  RETURNING id, user_id, name
),
all_orgs AS (
  SELECT user_id, company_name, org_id FROM existing
  UNION ALL
  SELECT user_id, name AS company_name, id AS org_id FROM created
)
UPDATE public.contacts c
SET organization_id = ao.org_id,
    updated_at = now()
FROM all_orgs ao
WHERE c.user_id = ao.user_id
  AND c.organization_id IS NULL
  AND lower(btrim(c.company)) = lower(ao.company_name);
