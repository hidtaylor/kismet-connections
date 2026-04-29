import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Plus, ChevronRight, Search } from "lucide-react";
import { EmptyState, RowSkeleton } from "@/components/EmptyState";

export default function OrganizationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["organizations", user?.id, debounced],
    queryFn: async () => {
      let q = supabase
        .from("organizations")
        .select("id, name, kind, website, contacts!contacts_organization_id_fkey(count)");
      if (debounced) q = q.ilike("name", `%${debounced}%`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []).map((o: any) => ({
        ...o,
        contact_count: o.contacts?.[0]?.count ?? 0,
      }));
      rows.sort((a, b) =>
        b.contact_count - a.contact_count || a.name.localeCompare(b.name),
      );
      return rows;
    },
    enabled: !!user,
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-2 py-2 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-sm font-medium">Organizations</h1>
        <Button
          size="sm"
          onClick={() => navigate("/organizations/new")}
          className="bg-gradient-kismet text-primary-foreground hover:opacity-90"
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> New
        </Button>
      </header>

      <div className="px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search organizations…"
            className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="bg-card hairline border-y">
        {isLoading ? (
          <>
            <RowSkeleton /> <RowSkeleton /> <RowSkeleton />
          </>
        ) : !orgs || orgs.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-7 w-7" />}
            title={debounced ? "No matches" : "No organizations yet"}
            body={
              debounced
                ? "Try a different name."
                : "Add brokerages, associations, MLS, vendors, or portals to group your contacts."
            }
          />
        ) : (
          orgs.map((o) => (
            <Link
              key={o.id}
              to={`/organizations/${o.id}`}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-accent/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{o.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {o.kind} · {o.contact_count} {o.contact_count === 1 ? "contact" : "contacts"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
