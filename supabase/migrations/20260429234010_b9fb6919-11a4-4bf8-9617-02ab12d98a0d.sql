-- Restrict EXECUTE on recompute_graph_strength so the linter no longer flags
-- broad signed-in execution. The edge function calls this with the user's JWT
-- (authenticated role), so we keep authenticated access but revoke from
-- public/anon.
REVOKE EXECUTE ON FUNCTION public.recompute_graph_strength(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_graph_strength(uuid) FROM anon;

-- Add an internal authorization check so even an authenticated user can only
-- recompute their own graph, regardless of what p_user_id is passed.
CREATE OR REPLACE FUNCTION public.recompute_graph_strength(p_user_id uuid)
 RETURNS TABLE(edges_scored integer, orgs_scored integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_person_count INT;
  v_org_count INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH pair_scores AS (
    SELECT
      ic1.user_id,
      gn1.id AS source_node_id,
      gn2.id AS target_node_id,
      SUM(
        CASE i.type
          WHEN 'in_person' THEN 10
          WHEN 'video' THEN 5
          WHEN 'call' THEN 3
          WHEN 'email' THEN 1
          WHEN 'conference' THEN 2
          ELSE 1
        END
        * ln(1 + COALESCE(EXTRACT(EPOCH FROM (i.ended_at - i.occurred_at)) / 60.0, 30))
        * exp(- EXTRACT(EPOCH FROM (now() - i.occurred_at)) / (180.0 * 86400.0))
      ) AS raw_score
    FROM public.interaction_contacts ic1
    JOIN public.interaction_contacts ic2
      ON ic2.interaction_id = ic1.interaction_id
      AND ic2.user_id = ic1.user_id
      AND ic2.contact_id <> ic1.contact_id
    JOIN public.interactions i ON i.id = ic1.interaction_id
    JOIN public.graph_nodes gn1
      ON gn1.user_id = ic1.user_id AND gn1.ref_table = 'contacts' AND gn1.ref_id = ic1.contact_id
    JOIN public.graph_nodes gn2
      ON gn2.user_id = ic2.user_id AND gn2.ref_table = 'contacts' AND gn2.ref_id = ic2.contact_id
    WHERE ic1.user_id = p_user_id
    GROUP BY ic1.user_id, gn1.id, gn2.id
  ),
  max_score AS (
    SELECT GREATEST(MAX(raw_score), 1.0) AS m FROM pair_scores
  )
  UPDATE public.graph_edges ge
  SET strength_score = LEAST(100, GREATEST(0, ROUND((ps.raw_score / ms.m) * 100)))::int,
      updated_at = now()
  FROM pair_scores ps, max_score ms
  WHERE ge.user_id = p_user_id
    AND ge.source_node_id = ps.source_node_id
    AND ge.target_node_id = ps.target_node_id
    AND ge.kind IN ('met_with','co_thread','co_attended','knows','worked_with');

  GET DIAGNOSTICS v_person_count = ROW_COUNT;

  WITH person_warmth AS (
    SELECT source_node_id AS person_node, MAX(strength_score) AS warmth
    FROM public.graph_edges
    WHERE user_id = p_user_id
      AND kind IN ('met_with','co_thread','co_attended')
    GROUP BY source_node_id
  ),
  org_rollup AS (
    SELECT
      ge.user_id,
      ge.source_node_id AS person_node,
      ge.target_node_id AS org_node,
      ge.kind,
      CASE ge.kind
        WHEN 'works_at' THEN 1.0
        WHEN 'advisor' THEN 0.8
        WHEN 'board' THEN 0.8
        WHEN 'founder' THEN 0.8
        WHEN 'formerly_at' THEN 0.3
        ELSE 0.5
      END AS aff_weight
    FROM public.graph_edges ge
    WHERE ge.user_id = p_user_id
      AND ge.kind IN ('works_at','formerly_at','advisor','board','founder')
  ),
  org_scores AS (
    SELECT
      org_rollup.org_node,
      ln(1 + SUM(COALESCE(pw.warmth, 0) * org_rollup.aff_weight)) AS raw
    FROM org_rollup
    LEFT JOIN person_warmth pw ON pw.person_node = org_rollup.person_node
    GROUP BY org_rollup.org_node
  ),
  org_max AS (
    SELECT GREATEST(MAX(raw), 0.0001) AS m FROM org_scores
  )
  UPDATE public.graph_edges ge
  SET strength_score = LEAST(100, GREATEST(0, ROUND((os.raw / om.m) * 100)))::int,
      updated_at = now()
  FROM org_scores os, org_max om
  WHERE ge.user_id = p_user_id
    AND ge.target_node_id = os.org_node
    AND ge.kind IN ('works_at','formerly_at','advisor','board','founder');

  GET DIAGNOSTICS v_org_count = ROW_COUNT;

  RETURN QUERY SELECT v_person_count, v_org_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.recompute_graph_strength(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_graph_strength(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_graph_strength(uuid) TO authenticated;