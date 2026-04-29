-- Phase 2a: graph edge triggers, backfill, and strength scoring

-- 1a. works_at trigger driven by contacts.organization_id
CREATE OR REPLACE FUNCTION public.populate_works_at_edge()
RETURNS TRIGGER AS $$
DECLARE
  person_node UUID;
  new_org_node UUID;
  old_org_node UUID;
BEGIN
  SELECT id INTO person_node FROM public.graph_nodes
    WHERE user_id = NEW.user_id AND ref_table = 'contacts' AND ref_id = NEW.id;
  IF person_node IS NULL THEN RETURN NEW; END IF;

  IF NEW.organization_id IS NOT NULL THEN
    SELECT id INTO new_org_node FROM public.graph_nodes
      WHERE user_id = NEW.user_id AND ref_table = 'organizations' AND ref_id = NEW.organization_id;
    IF new_org_node IS NOT NULL THEN
      INSERT INTO public.graph_edges
        (user_id, source_node_id, target_node_id, kind, confidence)
      VALUES
        (NEW.user_id, person_node, new_org_node, 'works_at', 'confirmed')
      ON CONFLICT (user_id, source_node_id, target_node_id, kind)
      DO UPDATE SET last_seen_at = now(), confidence = 'confirmed';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.organization_id IS NOT NULL
     AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    SELECT id INTO old_org_node FROM public.graph_nodes
      WHERE user_id = NEW.user_id AND ref_table = 'organizations' AND ref_id = OLD.organization_id;
    IF old_org_node IS NOT NULL THEN
      DELETE FROM public.graph_edges
        WHERE user_id = NEW.user_id
          AND source_node_id = person_node
          AND target_node_id = old_org_node
          AND kind = 'works_at';
      INSERT INTO public.graph_edges
        (user_id, source_node_id, target_node_id, kind, confidence)
      VALUES
        (NEW.user_id, person_node, old_org_node, 'formerly_at', 'confirmed')
      ON CONFLICT (user_id, source_node_id, target_node_id, kind) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.populate_works_at_edge() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_works_at_edge ON public.contacts;
CREATE TRIGGER trg_works_at_edge
  AFTER INSERT OR UPDATE OF organization_id ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.populate_works_at_edge();

-- 1b. Pairwise edges from interaction_contacts inserts
CREATE OR REPLACE FUNCTION public.populate_interaction_edges()
RETURNS TRIGGER AS $$
DECLARE
  ix_type public.interaction_type;
  ek public.edge_kind;
  new_node UUID;
  other_node UUID;
  other_contact UUID;
BEGIN
  SELECT type INTO ix_type FROM public.interactions WHERE id = NEW.interaction_id;
  ek := CASE
    WHEN ix_type IN ('in_person','video','call') THEN 'met_with'::public.edge_kind
    WHEN ix_type = 'email' THEN 'co_thread'::public.edge_kind
    ELSE 'co_attended'::public.edge_kind
  END;

  SELECT id INTO new_node FROM public.graph_nodes
    WHERE user_id = NEW.user_id AND ref_table = 'contacts' AND ref_id = NEW.contact_id;
  IF new_node IS NULL THEN RETURN NEW; END IF;

  FOR other_contact IN
    SELECT contact_id FROM public.interaction_contacts
    WHERE interaction_id = NEW.interaction_id
      AND user_id = NEW.user_id
      AND contact_id <> NEW.contact_id
  LOOP
    SELECT id INTO other_node FROM public.graph_nodes
      WHERE user_id = NEW.user_id AND ref_table = 'contacts' AND ref_id = other_contact;
    IF other_node IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.graph_edges
      (user_id, source_node_id, target_node_id, kind, confidence)
    VALUES
      (NEW.user_id, new_node, other_node, ek, 'inferred')
    ON CONFLICT (user_id, source_node_id, target_node_id, kind)
    DO UPDATE SET last_seen_at = now();

    INSERT INTO public.graph_edges
      (user_id, source_node_id, target_node_id, kind, confidence)
    VALUES
      (NEW.user_id, other_node, new_node, ek, 'inferred')
    ON CONFLICT (user_id, source_node_id, target_node_id, kind)
    DO UPDATE SET last_seen_at = now();
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.populate_interaction_edges() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_interaction_edges ON public.interaction_contacts;
CREATE TRIGGER trg_interaction_edges
  AFTER INSERT ON public.interaction_contacts
  FOR EACH ROW EXECUTE FUNCTION public.populate_interaction_edges();

-- 1c. Backfill from existing data
INSERT INTO public.graph_edges (user_id, source_node_id, target_node_id, kind, confidence)
SELECT c.user_id, pn.id, on2.id, 'works_at'::public.edge_kind, 'confirmed'::public.edge_confidence
FROM public.contacts c
JOIN public.graph_nodes pn ON pn.user_id = c.user_id AND pn.ref_table = 'contacts' AND pn.ref_id = c.id
JOIN public.graph_nodes on2 ON on2.user_id = c.user_id AND on2.ref_table = 'organizations' AND on2.ref_id = c.organization_id
WHERE c.organization_id IS NOT NULL
ON CONFLICT (user_id, source_node_id, target_node_id, kind) DO NOTHING;

INSERT INTO public.graph_edges (user_id, source_node_id, target_node_id, kind, confidence)
SELECT
  ic1.user_id,
  gn1.id,
  gn2.id,
  CASE
    WHEN i.type IN ('in_person','video','call') THEN 'met_with'::public.edge_kind
    WHEN i.type = 'email' THEN 'co_thread'::public.edge_kind
    ELSE 'co_attended'::public.edge_kind
  END,
  'inferred'::public.edge_confidence
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
ON CONFLICT (user_id, source_node_id, target_node_id, kind) DO NOTHING;

-- 1d. Strength scoring RPC
CREATE OR REPLACE FUNCTION public.recompute_graph_strength(p_user_id UUID)
RETURNS TABLE (edges_scored INT, orgs_scored INT) AS $$
DECLARE
  v_person_count INT;
  v_org_count INT;
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.recompute_graph_strength(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_graph_strength(UUID) TO authenticated;