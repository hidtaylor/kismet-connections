import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, SectionHeader } from "@/components/EmptyState";
import { Mail, RefreshCw, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface InboxMsg {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
}

// Accept either raw message ID or a Gmail link like https://mail.google.com/mail/u/0/#inbox/<id>
function extractMessageId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{8,}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/[#/]([a-zA-Z0-9_-]{8,})(?:\/?|$)/);
  return m ? m[1] : null;
}

export default function GmailImportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState("");

  const list = useQuery({
    queryKey: ["gmail", "recent", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gmail-list-recent");
      if (error) throw error;
      return ((data as { messages: InboxMsg[] }).messages) ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const importMsg = useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase.functions.invoke(
        "gmail-import-contact",
        { body: { message_id: messageId } },
      );
      if (error) throw error;
      return data as { contact_id: string; created_new: boolean };
    },
    onSuccess: (r) => {
      toast.success(r.created_new ? "Contact created" : "Contact updated");
      navigate(`/contact/${r.contact_id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = extractMessageId(input);
    if (!id) {
      toast.error("Paste a Gmail message link or ID");
      return;
    }
    importMsg.mutate(id);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <h1 className="text-base font-semibold tracking-tight">Import from Gmail</h1>
          <button
            onClick={() => list.refetch()}
            disabled={list.isFetching}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${list.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <section className="px-4 pt-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <Label htmlFor="gmail-id" className="text-xs text-muted-foreground">
            Paste Gmail message link or ID
          </Label>
          <div className="flex gap-2">
            <Input
              id="gmail-id"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://mail.google.com/…"
              className="h-10"
            />
            <Button type="submit" disabled={importMsg.isPending} className="h-10">
              {importMsg.isPending ? "Importing…" : "Import"}
            </Button>
          </div>
        </form>
      </section>

      <SectionHeader>Recent inbox</SectionHeader>
      {list.isLoading ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : list.error ? (
        <div className="px-4 py-6 text-sm text-destructive">
          {(list.error as Error).message}
        </div>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="No messages"
          body="Inbox is empty or Gmail isn't connected."
        />
      ) : (
        <ul className="bg-card hairline border-y divide-y divide-border">
          {list.data.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => importMsg.mutate(m.id)}
                disabled={importMsg.isPending}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40 disabled:opacity-50"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.from}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.subject || "(no subject)"}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/80">{m.snippet}</p>
                </div>
                <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="h-8" />
    </div>
  );
}
