import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initials, relTime } from "@/lib/format";
import { ArrowLeft, Pencil, Mail, Phone, Globe, MapPin, Linkedin, Twitter, Sparkles, MessageSquare, Mic, Users, Video, Phone as PhoneIcon, Building2, Lock, Send, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { EnrichmentBadge } from "@/components/EnrichmentBadge";
import { AliasList, type Alias } from "@/components/AliasList";

const interactionIcon: Record<string, typeof Users> = {
  in_person: Users,
  call: PhoneIcon,
  video: Video,
  email: Mail,
  conference: Building2,
  other: MessageSquare,
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [noteBody, setNoteBody] = useState("");
  const [noteSensitivity, setNoteSensitivity] = useState<"normal" | "sensitive" | "private">("normal");
  const [savingNote, setSavingNote] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const { data: fieldSources } = useQuery({
    queryKey: ["field-sources", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_field_sources")
        .select("field_name, value, source, confidence, fetched_at, is_active")
        .eq("contact_id", id!)
        .eq("is_active", true);
      if (error) throw error;
      const map: Record<string, { source: string; confidence: number; fetched_at: string; value: string | null }> = {};
      for (const r of data ?? []) map[r.field_name] = r as any;
      return map;
    },
    enabled: !!id,
  });

  const { data: aliases } = useQuery({
    queryKey: ["aliases", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_aliases")
        .select("alias_type, alias_value, source")
        .eq("contact_id", id!);
      if (error) throw error;
      return (data ?? []) as Alias[];
    },
    enabled: !!id,
  });

  const { data: lastJob } = useQuery({
    queryKey: ["last-enrichment", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("enrichment_jobs")
        .select("created_at, status")
        .eq("contact_id", id!)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: connections } = useQuery({
    queryKey: ["connections", id],
    queryFn: async () => {
      const { data: edges, error } = await supabase
        .from("contact_edges")
        .select("to_contact, edge_type, strength, evidence")
        .eq("from_contact", id!)
        .order("strength", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((edges ?? []).map((e: any) => e.to_contact)));
      if (ids.length === 0) return [];
      const { data: contacts } = await supabase
        .from("contacts_resolved")
        .select("id, full_name, photo_url, title, company")
        .in("id", ids);
      const byId = new Map((contacts ?? []).map((c: any) => [c.id, c]));
      return (edges ?? []).map((e: any) => ({ ...e, contact: byId.get(e.to_contact) })).filter((e: any) => e.contact);
    },
    enabled: !!id,
  });

  const handleEnrich = async () => {
    if (!id) return;
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-contact", { body: { contact_id: id } });
      if (error) throw error;
      if (data?.status === "cached") toast.info("Already enriched recently");
      else if (data?.status === "success") toast.success(`Enriched · ${data.fields_added ?? 0} fields added`);
      else if (data?.status === "skipped") toast.info("Not enough info to enrich");
      else toast.success("Enrichment complete");
      qc.invalidateQueries({ queryKey: ["contact", id] });
      qc.invalidateQueries({ queryKey: ["field-sources", id] });
      qc.invalidateQueries({ queryKey: ["aliases", id] });
      qc.invalidateQueries({ queryKey: ["last-enrichment", id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  };

  const handleMakePrimary = async (a: Alias) => {
    if (!id || !user) return;
    const fieldName = a.alias_type === "linkedin" ? "linkedin_url" : a.alias_type;
    try {
      // Deactivate other sources for this field
      await supabase
        .from("contact_field_sources")
        .update({ is_active: false })
        .eq("contact_id", id)
        .eq("field_name", fieldName);
      // Upsert as user-source active
      await supabase.from("contact_field_sources").upsert({
        contact_id: id,
        user_id: user.id,
        field_name: fieldName,
        value: a.alias_value,
        source: "user",
        confidence: 100,
        fetched_at: new Date().toISOString(),
        is_active: true,
      }, { onConflict: "contact_id,field_name,source" });
      toast.success("Promoted to primary");
      qc.invalidateQueries({ queryKey: ["contact", id] });
      qc.invalidateQueries({ queryKey: ["field-sources", id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const fieldBadge = (field: string) => {
    const fs = fieldSources?.[field];
    if (!fs || fs.source === "user") return null;
    return <EnrichmentBadge source={fs.source} confidence={fs.confidence} fetchedAt={fs.fetched_at} />;
  };

  const { data: contact, isLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts_resolved")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: timeline } = useQuery({
    queryKey: ["timeline", id],
    queryFn: async () => {
      // Pull notes + interactions linked to this contact
      const [notesRes, icRes] = await Promise.all([
        supabase
          .from("notes")
          .select("id, body_md, transcript, created_at, interaction_id, sensitivity, provenance")
          .eq("contact_id", id!)
          .order("created_at", { ascending: false }),
        supabase
          .from("interaction_contacts")
          .select("interaction_id, interactions(id, title, type, occurred_at, summary, location)")
          .eq("contact_id", id!),
      ]);
      if (notesRes.error) throw notesRes.error;
      if (icRes.error) throw icRes.error;

      const items: Array<{
        kind: "note" | "interaction";
        ts: string;
        id: string;
        data: any;
      }> = [];
      (notesRes.data ?? []).forEach((n) =>
        items.push({ kind: "note", ts: n.created_at, id: n.id, data: n })
      );
      (icRes.data ?? []).forEach((row: any) => {
        if (row.interactions) {
          items.push({
            kind: "interaction",
            ts: row.interactions.occurred_at,
            id: row.interactions.id,
            data: row.interactions,
          });
        }
      });
      items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      return items;
    },
    enabled: !!id,
  });

  // Trigger summary refresh once when timeline changes meaningfully (debounced via tab focus is overkill — fire on mount)
  useEffect(() => {
    if (!id || !user) return;
    if (!timeline || timeline.length === 0) return;
    const t = setTimeout(() => {
      supabase.functions.invoke("refresh-contact-summary", {
        body: { contact_id: id },
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, timeline?.length, user?.id]);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!contact) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>← Back</Button>
        <EmptyState title="Contact not found" />
      </div>
    );
  }

  const emails: string[] = Array.isArray(contact.emails) ? (contact.emails as any) : [];
  const phones: string[] = Array.isArray(contact.phones) ? (contact.phones as any) : [];

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-2 py-2 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEnrich}
            disabled={enriching}
            className="gap-1 text-muted-foreground hover:text-foreground"
            aria-label="Refresh enrichment"
          >
            <RefreshCw className={`h-4 w-4 ${enriching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link
            to={`/contact/${contact.id}/edit`}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </div>
      </header>

      {/* Identity */}
      <div className="px-5 pb-4 pt-3">
        <Avatar className="h-20 w-20">
          <AvatarImage src={contact.photo_url ?? undefined} />
          <AvatarFallback className="bg-secondary text-lg">
            {initials(contact.full_name)}
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {contact.full_name}
          {fieldBadge("full_name")}
        </h1>
        {(contact.title || contact.company) && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[contact.title, contact.company].filter(Boolean).join(" · ")}
            {fieldBadge("title") ?? fieldBadge("company")}
          </p>
        )}
        {contact.location && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {contact.location}
            {fieldBadge("location")}
          </p>
        )}
        {/* Last enriched */}
        {lastJob?.created_at && (() => {
          const ageDays = (Date.now() - new Date(lastJob.created_at).getTime()) / 86400000;
          const stale = ageDays > 90;
          return (
            <p className={`mt-2 text-[10px] uppercase tracking-wider ${stale ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
              Last enriched {relTime(lastJob.created_at)}
              {stale && <> · refresh recommended</>}
            </p>
          );
        })()}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4">
        {emails[0] && (
          <a href={`mailto:${emails[0]}`} className="flex flex-col items-center gap-1 rounded-md bg-card hairline border py-3 text-xs">
            <Mail className="h-4 w-4 text-primary" /> Email
          </a>
        )}
        {phones[0] && (
          <a href={`tel:${phones[0]}`} className="flex flex-col items-center gap-1 rounded-md bg-card hairline border py-3 text-xs">
            <Phone className="h-4 w-4 text-primary" /> Call
          </a>
        )}
        {contact.linkedin_url && (
          <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-md bg-card hairline border py-3 text-xs">
            <Linkedin className="h-4 w-4 text-primary" /> LinkedIn
          </a>
        )}
        {contact.twitter_url && (
          <a href={contact.twitter_url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-md bg-card hairline border py-3 text-xs">
            <Twitter className="h-4 w-4 text-primary" /> Twitter
          </a>
        )}
        {contact.website_url && (
          <a href={contact.website_url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-md bg-card hairline border py-3 text-xs">
            <Globe className="h-4 w-4 text-primary" /> Website
          </a>
        )}
      </div>

      {/* Aliases */}
      <AliasList aliases={aliases ?? []} onMakePrimary={handleMakePrimary} />

      {/* Connections */}
      {connections && connections.length > 0 && (
        <section className="px-4 pb-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Connections
          </h2>
          <div className="rounded-lg bg-card hairline border divide-y divide-border">
            {connections.map((c: any) => {
              let chip = c.edge_type.replace(/_/g, " ");
              if (c.edge_type === "same_employer" && c.evidence?.company) {
                const yrs = c.evidence?.overlap_years;
                chip = `worked together at ${c.evidence.company}${yrs ? `, ${yrs}y overlap` : ""}`;
              } else if (c.edge_type === "past_colleague" && c.evidence?.companies?.[0]) {
                chip = `past colleague at ${c.evidence.companies[0]}`;
              } else if (c.edge_type === "education_overlap" && c.evidence?.school) {
                chip = `school: ${c.evidence.school}`;
              }
              return (
                <Link
                  key={`${c.to_contact}-${c.edge_type}`}
                  to={`/contact/${c.to_contact}`}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/50"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={c.contact.photo_url ?? undefined} />
                    <AvatarFallback className="text-xs bg-secondary">{initials(c.contact.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.contact.full_name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{chip}</p>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {c.strength}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* AI summary */}
      <section className="px-4 pb-4">
        <div className="rounded-lg bg-card hairline border p-4">
          <div className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" /> What to know
          </div>
          {contact.notes_summary ? (
            <p className="text-sm leading-relaxed">{contact.notes_summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No summary yet. Add notes or record a meeting and I'll summarize.
            </p>
          )}
        </div>
      </section>

      {/* Quick add note */}
      <section className="px-4 pb-4">
        <div className="rounded-lg bg-card hairline border p-3 space-y-2">
          <Textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Add a quick note about this person…"
            rows={2}
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <Select value={noteSensitivity} onValueChange={(v) => setNoteSensitivity(v as any)}>
              <SelectTrigger className="h-8 w-auto gap-1.5 border-none bg-transparent px-2 text-xs focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="sensitive">Sensitive</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!noteBody.trim() || savingNote}
              onClick={async () => {
                if (!user || !id) return;
                setSavingNote(true);
                const { error } = await supabase.from("notes").insert({
                  user_id: user.id,
                  contact_id: id,
                  body_md: noteBody.trim(),
                  sensitivity: noteSensitivity,
                  provenance: "user_memory",
                  confirmed_at: new Date().toISOString(),
                });
                setSavingNote(false);
                if (error) { toast.error(error.message); return; }
                setNoteBody("");
                setNoteSensitivity("normal");
                qc.invalidateQueries({ queryKey: ["timeline", id] });
                toast.success("Note added");
              }}
              className="bg-gradient-kismet text-primary-foreground hover:opacity-90"
            >
              <Send className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="pb-12">
        <div className="px-4 pb-2 pt-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Timeline
          </h2>
        </div>
        <div className="bg-card hairline border-y">
          {!timeline || timeline.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-7 w-7" />}
              title="No notes or interactions yet"
              body="Use the + button to add a voice note or record a meeting."
            />
          ) : (
            timeline.map((item) => {
              if (item.kind === "interaction") {
                const I = interactionIcon[item.data.type] ?? MessageSquare;
                return (
                  <div key={`i-${item.id}`} className="flex gap-3 border-b border-border px-4 py-3 last:border-0">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <I className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium">{item.data.title}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {relTime(item.ts)}
                        </span>
                      </div>
                      {item.data.summary && (
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {item.data.summary}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }
              const note = item.data;
              const hasVoice = !!note.transcript;
              const isSensitive = note.sensitivity === "sensitive" || note.sensitivity === "private";
              return (
                <div key={`n-${item.id}`} className="flex gap-3 border-b border-border px-4 py-3 last:border-0">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                    {hasVoice ? <Mic className="h-3.5 w-3.5 text-primary" /> : <MessageSquare className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          {hasVoice ? "Voice note" : "Note"}
                        </p>
                        {isSensitive && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground"
                            title={`${note.sensitivity} — excluded from AI summaries`}
                          >
                            <Lock className="h-2.5 w-2.5" />
                            {note.sensitivity}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {relTime(item.ts)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                      {note.body_md || note.transcript || "—"}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
