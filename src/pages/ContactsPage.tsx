import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ContactRow } from "@/components/ContactRow";
import { EmptyState, RowSkeleton } from "@/components/EmptyState";
import { Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import OrganizationsPage from "./OrganizationsPage";

type Tab = "people" | "companies";

export default function ContactsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialTab = (params.get("tab") as Tab) === "companies" ? "companies" : "people";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setParams(tab === "companies" ? { tab: "companies" } : {}, { replace: true });
  }, [tab, setParams]);

  const { data: people, isLoading } = useQuery({
    queryKey: ["contacts-all", user?.id, debounced],
    enabled: !!user && tab === "people",
    queryFn: async () => {
      let qy = supabase
        .from("contacts_resolved")
        .select("id, full_name, company, title, photo_url, last_contact_at, cadence")
        .order("full_name", { ascending: true })
        .limit(500);
      if (debounced) {
        qy = qy.or(
          `full_name.ilike.%${debounced}%,company.ilike.%${debounced}%,title.ilike.%${debounced}%`
        );
      }
      const { data, error } = await qy;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <h1 className="text-xl font-semibold tracking-tight">Contacts</h1>
        </div>
        {/* Segmented control */}
        <div className="px-4 pb-3">
          <div className="inline-flex w-full rounded-lg bg-secondary p-1">
            {(["people", "companies"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  tab === t
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      {tab === "people" ? (
        <>
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search contacts…"
                className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="bg-card hairline border-y">
            {isLoading ? (
              <>
                <RowSkeleton />
                <RowSkeleton />
                <RowSkeleton />
              </>
            ) : people && people.length > 0 ? (
              people.map((c) => <ContactRow key={c.id} contact={c} />)
            ) : (
              <EmptyState
                icon={<Users className="h-7 w-7" />}
                title={debounced ? "No matches" : "No contacts yet"}
                body={
                  debounced
                    ? "Try a different name."
                    : "Tap + to scan a card, record a note, or add someone manually."
                }
              />
            )}
          </div>
          <div className="h-12" />
        </>
      ) : (
        <OrganizationsPage embedded />
      )}
    </div>
  );
}
