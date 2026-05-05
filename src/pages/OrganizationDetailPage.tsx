import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Globe, Pencil, ChevronRight, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: org, isLoading } = useQuery({
    queryKey: ["org", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: contacts } = useQuery({
    queryKey: ["org-contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts_resolved")
        .select("id, full_name, title, photo_url")
        .eq("organization_id", id!)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!org) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>← Back</Button>
        <EmptyState title="Organization not found" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-2 py-2 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link to={`/organizations/${org.id}/edit`} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Pencil className="h-4 w-4" /> Edit
        </Link>
      </header>

      <div className="px-5 pb-4 pt-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-md bg-secondary">
          {org.logo_url ? (
            <img src={org.logo_url} alt="" className="h-full w-full rounded-md object-cover" />
          ) : (
            <Building2 className="h-8 w-8 text-primary" />
          )}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">{org.kind}</p>
        {org.website && (
          <a href={org.website} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary">
            <Globe className="h-3 w-3" /> {org.website}
          </a>
        )}
        {org.notes && <p className="mt-3 text-sm leading-relaxed">{org.notes}</p>}
      </div>

      <section className="pb-12">
        <div className="px-4 pb-2 pt-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            People ({contacts?.length ?? 0})
          </h2>
        </div>
        <div className="bg-card hairline border-y">
          {!contacts || contacts.length === 0 ? (
            <EmptyState icon={<Users className="h-7 w-7" />} title="No contacts linked" body="Set this organization as Company on a contact." />
          ) : (
            contacts.map((c) => (
              <Link
                key={c.id}
                to={`/contact/${c.id}`}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-accent/40"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={c.photo_url ?? undefined} />
                  <AvatarFallback className="bg-secondary text-xs">{initials(c.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.full_name}</p>
                  {c.title && <p className="truncate text-xs text-muted-foreground">{c.title}</p>}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
