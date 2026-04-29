import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Plus, ChevronRight } from "lucide-react";
import { EmptyState, RowSkeleton } from "@/components/EmptyState";

export default function OrganizationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["organizations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, kind, website")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
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

      <div className="bg-card hairline border-y">
        {isLoading ? (
          <>
            <RowSkeleton /> <RowSkeleton /> <RowSkeleton />
          </>
        ) : !orgs || orgs.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-7 w-7" />}
            title="No organizations yet"
            body="Add brokerages, associations, MLS, vendors, or portals to group your contacts."
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
                <p className="truncate text-xs text-muted-foreground">{o.kind}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
