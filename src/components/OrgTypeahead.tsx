import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Building2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrgPick = {
  organization_id: string | null;
  company: string;
};

export function OrgTypeahead({
  value,
  onChange,
  placeholder = "Search or create organization",
}: {
  value: OrgPick;
  onChange: (v: OrgPick) => void;
  placeholder?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value.company ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value.company ?? "");
  }, [value.company]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const { data: matches } = useQuery({
    queryKey: ["org-search", user?.id, query],
    queryFn: async () => {
      const q = query.trim();
      let req = supabase
        .from("organizations")
        .select("id, name, kind")
        .order("name", { ascending: true })
        .limit(8);
      if (q) req = req.ilike("name", `%${q}%`);
      const { data, error } = await req;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && open,
  });

  async function createOrg(name: string) {
    if (!user || !name.trim()) return;
    const { data, error } = await supabase
      .from("organizations")
      .insert({ user_id: user.id, name: name.trim(), kind: "other" })
      .select("id, name")
      .single();
    if (error || !data) return;
    onChange({ organization_id: data.id, company: data.name });
    setOpen(false);
  }

  const exact = matches?.some((m) => m.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Detach link if user retypes
          onChange({ organization_id: null, company: e.target.value });
        }}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {(matches ?? []).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange({ organization_id: m.id, company: m.name });
                setQuery(m.name);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                value.organization_id === m.id && "bg-accent"
              )}
            >
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate">{m.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.kind}</span>
            </button>
          ))}
          {query.trim() && !exact && (
            <button
              type="button"
              onClick={() => createOrg(query)}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span>Create "<span className="font-medium">{query.trim()}</span>"</span>
            </button>
          )}
          {(!matches || matches.length === 0) && !query.trim() && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Start typing to search…</p>
          )}
        </div>
      )}
    </div>
  );
}
