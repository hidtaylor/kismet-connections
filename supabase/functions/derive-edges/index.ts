// Derive contact_edges (same_employer / past_colleague / education_overlap) for one user.
// Idempotent: upserts by (user_id, from_contact, to_contact, edge_type).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type WorkEntry = { company: string; title?: string | null; start_year?: number | null; end_year?: number | null };
type EduEntry = { school: string; start_year?: number | null; end_year?: number | null };

function normCompany(s: string): string {
  return s.toLowerCase().replace(/\b(inc|llc|ltd|corp|co|corporation|company|gmbh|sa|plc|the)\b/g, "").replace(/[^a-z0-9]/g, "").trim();
}
function normSchool(s: string): string {
  return s.toLowerCase().replace(/\b(university|college|school|of|the)\b/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function yearOverlap(a: { s?: number | null; e?: number | null }, b: { s?: number | null; e?: number | null }): number {
  const aS = a.s ?? null, aE = a.e ?? new Date().getFullYear();
  const bS = b.s ?? null, bE = b.e ?? new Date().getFullYear();
  if (aS == null || bS == null) return 0;
  const start = Math.max(aS, bS);
  const end = Math.min(aE, bE);
  return Math.max(0, end - start);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userIds: string[] = [];
    const body = await req.json().catch(() => ({}));
    if (body?.user_id) {
      userIds = [body.user_id];
    } else {
      // Nightly run for all users that have any work_history rows
      const { data } = await admin
        .from("contact_field_sources")
        .select("user_id")
        .in("field_name", ["work_history", "education"]);
      userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    }

    let totalEdges = 0;
    for (const userId of userIds) {
      const { data: rows } = await admin
        .from("contact_field_sources")
        .select("contact_id, field_name, value")
        .eq("user_id", userId)
        .in("field_name", ["work_history", "education"]);
      if (!rows || rows.length === 0) continue;

      const work: Record<string, WorkEntry[]> = {};
      const edu: Record<string, EduEntry[]> = {};
      for (const r of rows) {
        try {
          const parsed = JSON.parse(r.value as string);
          if (r.field_name === "work_history") work[r.contact_id] = parsed;
          else edu[r.contact_id] = parsed;
        } catch (_) {}
      }

      const contactIds = Array.from(new Set([...Object.keys(work), ...Object.keys(edu)]));
      const edgeMap = new Map<string, { type: string; strength: number; evidence: any; from: string; to: string }>();

      const addEdge = (from: string, to: string, type: string, strength: number, evidence: any) => {
        const key = `${from}|${to}|${type}`;
        const existing = edgeMap.get(key);
        if (!existing || strength > existing.strength) {
          edgeMap.set(key, { from, to, type, strength: Math.min(100, Math.max(0, Math.round(strength))), evidence });
        }
      };

      for (let i = 0; i < contactIds.length; i++) {
        for (let j = i + 1; j < contactIds.length; j++) {
          const a = contactIds[i], b = contactIds[j];

          // Employer overlap
          const aWork = work[a] ?? [];
          const bWork = work[b] ?? [];
          const sharedEmployers: Array<{ company: string; overlapYears: number; aRange: any; bRange: any }> = [];
          for (const aw of aWork) {
            for (const bw of bWork) {
              if (!aw.company || !bw.company) continue;
              if (normCompany(aw.company) !== normCompany(bw.company)) continue;
              const ov = yearOverlap({ s: aw.start_year, e: aw.end_year }, { s: bw.start_year, e: bw.end_year });
              sharedEmployers.push({
                company: aw.company,
                overlapYears: ov,
                aRange: { from: aw.start_year, to: aw.end_year },
                bRange: { from: bw.start_year, to: bw.end_year },
              });
            }
          }

          if (sharedEmployers.length > 0) {
            const best = sharedEmployers.reduce((p, c) => c.overlapYears > p.overlapYears ? c : p, sharedEmployers[0]);
            if (best.overlapYears > 0) {
              const strength = best.overlapYears * 10;
              const evidence = { company: best.company, from_years: best.aRange, to_years: best.bRange, overlap_years: best.overlapYears };
              addEdge(a, b, "same_employer", strength, evidence);
              addEdge(b, a, "same_employer", strength, evidence);
            } else {
              const strength = 30 + (sharedEmployers.length - 1) * 10;
              const evidence = { companies: sharedEmployers.map((s) => s.company) };
              addEdge(a, b, "past_colleague", strength, evidence);
              addEdge(b, a, "past_colleague", strength, evidence);
            }
          }

          // Education overlap
          const aEdu = edu[a] ?? [];
          const bEdu = edu[b] ?? [];
          for (const ae of aEdu) {
            for (const be of bEdu) {
              if (!ae.school || !be.school) continue;
              if (normSchool(ae.school) !== normSchool(be.school)) continue;
              const ov = yearOverlap({ s: ae.start_year, e: ae.end_year }, { s: be.start_year, e: be.end_year });
              if (ov > 0) {
                const strength = 50 + ov * 10;
                const evidence = { school: ae.school, overlap_years: ov, a_range: ae, b_range: be };
                addEdge(a, b, "education_overlap", strength, evidence);
                addEdge(b, a, "education_overlap", strength, evidence);
              }
            }
          }
        }
      }

      if (edgeMap.size === 0) continue;
      const rowsToUpsert = Array.from(edgeMap.values()).map((e) => ({
        user_id: userId,
        from_contact: e.from,
        to_contact: e.to,
        edge_type: e.type,
        strength: e.strength,
        evidence: e.evidence,
        detected_at: new Date().toISOString(),
      }));
      const { error } = await admin
        .from("contact_edges")
        .upsert(rowsToUpsert, { onConflict: "user_id,from_contact,to_contact,edge_type" });
      if (!error) totalEdges += rowsToUpsert.length;
    }

    return new Response(JSON.stringify({ users: userIds.length, edges_upserted: totalEdges }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
