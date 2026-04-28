import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ContactRow } from "@/components/ContactRow";
import { EmptyState, SectionHeader, RowSkeleton } from "@/components/EmptyState";
import { Search, Users, Sparkles } from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const { data: recents, isLoading } = useQuery({
    queryKey: ["contacts", "recent", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, full_name, company, title, photo_url, last_contact_at, cadence")
        .order("last_contact_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: overdue } = useQuery({
    queryKey: ["contacts", "overdue", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, full_name, company, title, photo_url, last_contact_at, cadence")
        .neq("cadence", "none")
        .order("last_contact_at", { ascending: true, nullsFirst: true })
        .limit(50);
      if (error) throw error;
      // Filter to ones actually overdue, client-side (small list)
      return (data ?? []).filter((c) => {
        if (!c.last_contact_at) return true;
        const days =
          c.cadence === "close" ? 14 :
          c.cadence === "monthly" ? 30 :
          c.cadence === "quarterly" ? 90 :
          c.cadence === "annual" ? 365 : null;
        if (!days) return false;
        return Date.now() - new Date(c.last_contact_at).getTime() > days * 86_400_000;
      }).slice(0, 5);
    },
    enabled: !!user,
  });

  // Submit takes us to Search prefilled
  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Header / search */}
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="px-4 pb-3 pt-3">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">Kismet</h1>
            <span className="text-[11px] text-muted-foreground">
              {recents?.length ?? 0} contacts
            </span>
          </div>
          <form onSubmit={onSearchSubmit} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people, notes, transcripts…"
              className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              onFocus={() => navigate(`/search${q ? `?q=${encodeURIComponent(q)}` : ""}`)}
              readOnly
            />
          </form>
        </div>
      </header>

      {/* Needs attention */}
      {overdue && overdue.length > 0 && (
        <section>
          <SectionHeader>Needs attention</SectionHeader>
          <div className="bg-card hairline border-y">
            {overdue.map((c) => (
              <ContactRow key={c.id} contact={c} showOverdue />
            ))}
          </div>
        </section>
      )}

      {/* Recently active */}
      <section>
        <SectionHeader>Recently active</SectionHeader>
        <div className="bg-card hairline border-y">
          {isLoading ? (
            <>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          ) : recents && recents.length > 0 ? (
            recents.map((c) => <ContactRow key={c.id} contact={c} />)
          ) : (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No contacts yet"
              body="Tap the + button to scan a card, record a note, or add someone manually."
              action={
                <Link
                  to="/contact/new"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Add your first contact
                </Link>
              }
            />
          )}
        </div>
      </section>

      <div className="h-8" />
    </div>
  );
}
