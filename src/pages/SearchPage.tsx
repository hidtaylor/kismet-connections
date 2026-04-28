import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Search, Users, MessageSquare, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactRow } from "@/components/ContactRow";
import { highlight, snippet, relTime } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);

  // Debounce
  const [debounced, setDebounced] = useState(initial);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (debounced) setParams({ q: debounced }, { replace: true });
    else setParams({}, { replace: true });
  }, [debounced, setParams]);

  const enabled = debounced.trim().length >= 1;

  const { data: contacts } = useQuery({
    queryKey: ["search-contacts", debounced],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, full_name, company, title, photo_url, last_contact_at, cadence")
        .or(
          `full_name.ilike.%${debounced}%,company.ilike.%${debounced}%,title.ilike.%${debounced}%`
        )
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: notes } = useQuery({
    queryKey: ["search-notes", debounced],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, body_md, transcript, created_at, contact_id")
        .or(`body_md.ilike.%${debounced}%,transcript.ilike.%${debounced}%`)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: recordings } = useQuery({
    queryKey: ["search-recordings", debounced],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recordings")
        .select("id, transcript_text, created_at, interaction_id")
        .ilike("transcript_text", `%${debounced}%`)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalResults = (contacts?.length ?? 0) + (notes?.length ?? 0) + (recordings?.length ?? 0);

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
      >
        <div className="flex items-center gap-1 px-2 py-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people, notes, transcripts…"
              className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </header>

      {!enabled ? (
        <EmptyState icon={<Search className="h-7 w-7" />} title="Type to search" body="Find contacts, notes, and meeting transcripts." />
      ) : totalResults === 0 ? (
        <EmptyState title="No results" body={`Nothing matched "${debounced}".`} />
      ) : (
        <>
          {contacts && contacts.length > 0 && (
            <Section title="People" count={contacts.length} icon={<Users className="h-3.5 w-3.5" />}>
              <div className="bg-card hairline border-y">
                {contacts.map((c) => <ContactRow key={c.id} contact={c} />)}
              </div>
            </Section>
          )}
          {notes && notes.length > 0 && (
            <Section title="Notes" count={notes.length} icon={<MessageSquare className="h-3.5 w-3.5" />}>
              <div className="bg-card hairline border-y">
                {notes.map((n) => (
                  <Link
                    key={n.id}
                    to={n.contact_id ? `/contact/${n.contact_id}` : "/"}
                    className="block border-b border-border px-4 py-3 last:border-0 hover:bg-surface-2"
                  >
                    <p className="text-[11px] text-muted-foreground">{relTime(n.created_at)}</p>
                    <p
                      className="mt-1 text-sm leading-relaxed"
                      dangerouslySetInnerHTML={highlight(snippet(n.body_md || n.transcript || "", debounced), debounced)}
                    />
                  </Link>
                ))}
              </div>
            </Section>
          )}
          {recordings && recordings.length > 0 && (
            <Section title="Transcripts" count={recordings.length} icon={<Mic className="h-3.5 w-3.5" />}>
              <div className="bg-card hairline border-y">
                {recordings.map((r) => (
                  <div key={r.id} className="border-b border-border px-4 py-3 last:border-0">
                    <p className="text-[11px] text-muted-foreground">{relTime(r.created_at)}</p>
                    <p
                      className="mt-1 text-sm leading-relaxed"
                      dangerouslySetInnerHTML={highlight(snippet(r.transcript_text ?? "", debounced), debounced)}
                    />
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
      <div className="h-12" />
    </div>
  );
}

function Section({ title, count, icon, children }: { title: string; count: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 px-4 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {title} <span className="text-muted-foreground/60">· {count}</span>
      </div>
      {children}
    </section>
  );
}
