import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Lock, ShieldAlert, Sparkles, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { useState } from "react";

type SuggestionRow = {
  id: string;
  contact_id: string | null;
  source_interaction_id: string | null;
  body_md: string;
  suggested_sensitivity: "normal" | "sensitive" | "private";
  reasoning: string | null;
  created_at: string;
  contacts: { id: string; full_name: string } | null;
};

export default function MemoryInboxPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["suggested-memories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suggested_memories")
        .select("id, contact_id, source_interaction_id, body_md, suggested_sensitivity, reasoning, created_at, contacts(id, full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SuggestionRow[];
    },
    enabled: !!user,
  });

  async function accept(s: SuggestionRow) {
    if (!user) return;
    setBusy(s.id);
    const { error: insErr } = await supabase.from("notes").insert({
      user_id: user.id,
      contact_id: s.contact_id,
      interaction_id: s.source_interaction_id,
      body_md: s.body_md,
      provenance: "ai_inference",
      sensitivity: s.suggested_sensitivity,
      confirmed_at: new Date().toISOString(),
      source_interaction_id: s.source_interaction_id,
    });
    if (insErr) { setBusy(null); toast.error(insErr.message); return; }
    await supabase.from("suggested_memories")
      .update({ status: "accepted", decided_at: new Date().toISOString() })
      .eq("id", s.id);
    setBusy(null);
    toast.success("Saved to memories");
    qc.invalidateQueries({ queryKey: ["suggested-memories"] });
    qc.invalidateQueries({ queryKey: ["pending-memory-count"] });
  }

  async function discard(s: SuggestionRow) {
    setBusy(s.id);
    await supabase.from("suggested_memories")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", s.id);
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["suggested-memories"] });
    qc.invalidateQueries({ queryKey: ["pending-memory-count"] });
  }

  // Group by contact
  const grouped = (suggestions ?? []).reduce<Record<string, SuggestionRow[]>>((acc, s) => {
    const key = s.contacts?.full_name ?? "Unlinked";
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full max-w-md">
      {!embedded && (
        <header
          className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/85 px-2 py-2 backdrop-blur-md"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
        >
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-sm font-medium">Suggested memories</h1>
        </header>
      )}

      <div className="px-4 py-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (suggestions ?? []).length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-7 w-7" />}
            title="No pending memories"
            body="Sync Fireflies or record a meeting to get suggestions."
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([name, items]) => (
              <section key={name} className="space-y-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {name}
                </h2>
                {items.map((s) => (
                  <article key={s.id} className="rounded-lg bg-card hairline border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed">{s.body_md}</p>
                      <SensitivityBadge value={s.suggested_sensitivity} />
                    </div>
                    {s.reasoning && (
                      <Collapsible className="mt-2">
                        <CollapsibleTrigger className="text-[11px] text-muted-foreground underline">
                          Why this was suggested
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1 text-[11px] text-muted-foreground">
                          {s.reasoning}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" disabled={busy === s.id} onClick={() => accept(s)} className="bg-gradient-kismet text-primary-foreground hover:opacity-90">
                        <Check className="mr-1 h-3.5 w-3.5" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => discard(s)}>
                        <X className="mr-1 h-3.5 w-3.5" /> Discard
                      </Button>
                      {s.contacts && (
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/contact/${s.contacts!.id}`)} className="ml-auto text-xs">
                          View contact
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SensitivityBadge({ value }: { value: "normal" | "sensitive" | "private" }) {
  if (value === "normal") return null;
  const isPrivate = value === "private";
  const Icon = isPrivate ? Lock : ShieldAlert;
  const cls = isPrivate
    ? "bg-destructive/15 text-destructive"
    : "bg-warning/15 text-warning";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" /> {value}
    </span>
  );
}
