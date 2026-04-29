import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Mic, Square, RotateCcw, Save, ShieldAlert } from "lucide-react";
import { useAudioRecorder, LevelMeter, fmtDuration } from "@/lib/recorder";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

export default function RecordMeetingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const r = useAudioRecorder();
  const [consented, setConsented] = useState(false);
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactQuery, setContactQuery] = useState("");

  const { data: contacts } = useQuery({
    queryKey: ["meeting-contacts-pick", contactQuery],
    queryFn: async () => {
      let q = supabase.from("contacts").select("id, full_name, company").order("full_name").limit(30);
      if (contactQuery.trim())
        q = q.or(`full_name.ilike.%${contactQuery}%,company.ilike.%${contactQuery}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: consented,
  });

  useEffect(() => {
    if (r.state !== "stopped" || !r.blob || !user || storagePath) return;
    (async () => {
      setTranscribing(true);
      const ext = r.blob!.type.includes("mp4") ? "mp4" : "webm";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("recordings").upload(path, r.blob!, {
        contentType: r.blob!.type || "audio/webm",
      });
      if (up.error) { toast.error(up.error.message); setTranscribing(false); return; }
      setStoragePath(path);
      try {
        const { data, error } = await supabase.functions.invoke("transcribe-audio", {
          body: { storage_path: path, duration_seconds: r.duration, kind: "meeting" },
        });
        if (error) throw error;
        setTranscript(data?.transcript ?? "");
        setSummary(data?.summary ?? "");
      } catch (e: any) {
        toast.error(e?.message ?? "Transcription failed");
      } finally {
        setTranscribing(false);
      }
    })();
  }, [r.state, r.blob, user, r.duration, storagePath]);

  async function save() {
    if (!user || !storagePath) return;
    if (!title.trim()) { toast.error("Add a title"); return; }
    setSaving(true);

    // 1. Create interaction
    const { data: interaction, error: ie } = await supabase
      .from("interactions")
      .insert({
        user_id: user.id,
        title: title.trim(),
        type: "in_person",
        occurred_at: new Date().toISOString(),
        summary,
      })
      .select("id").single();
    if (ie) { setSaving(false); toast.error(ie.message); return; }

    // 2. Save recording linked to interaction
    await supabase.from("recordings").insert({
      user_id: user.id,
      interaction_id: interaction!.id,
      storage_path: storagePath,
      duration_seconds: r.duration,
      transcript_text: transcript,
      transcript_status: "done",
      consent_disclosed: true,
    });

    // 3. Link contacts
    if (selectedContacts.length > 0) {
      await supabase.from("interaction_contacts").insert(
        selectedContacts.map((cid) => ({
          interaction_id: interaction!.id,
          contact_id: cid,
          user_id: user.id,
        }))
      );
      // Bump last_contact_at for each
      await supabase.from("contacts")
        .update({ last_contact_at: new Date().toISOString() })
        .in("id", selectedContacts);
      // Trigger summary refresh
      selectedContacts.forEach((cid) =>
        supabase.functions.invoke("refresh-contact-summary", { body: { contact_id: cid } }).catch(() => {})
      );
    }

    // 4. Extract candidate memories (fire-and-forget)
    if (transcript && transcript.length > 200 && selectedContacts.length > 0) {
      supabase.functions.invoke("extract-memories", {
        body: { interaction_id: interaction!.id, transcript },
      }).catch(() => {});
    }

    setSaving(false);
    toast.success("Meeting saved");
    navigate("/", { replace: true });
  }

  // STEP 1 — Consent screen
  if (!consented) {
    return (
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col">
        <header
          className="sticky top-0 z-30 flex items-center border-b border-border bg-background/85 px-2 py-2 backdrop-blur-md"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
        >
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="ml-2 text-sm font-medium">Record meeting</h1>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/15">
            <ShieldAlert className="h-7 w-7 text-warning" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Consent disclosure</h2>
            <p className="text-sm text-muted-foreground text-balance">
              You're about to record this conversation. <strong className="text-foreground">All parties should be aware</strong> and have agreed.
              Tap to confirm you've disclosed this.
            </p>
          </div>
          <Button size="lg" className="w-full max-w-xs" onClick={() => setConsented(true)}>
            I've disclosed — start recording
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
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
        <h1 className="text-sm font-medium">Record meeting</h1>
        <div className="w-10" />
      </header>

      <div className="space-y-6 px-4 py-6">
        <div className="flex flex-col items-center rounded-lg bg-card hairline border p-6">
          <p className="text-3xl font-semibold tabular-nums">{fmtDuration(r.duration)}</p>
          <div className="my-5">
            <LevelMeter level={r.level} recording={r.state === "recording"} />
          </div>
          {r.state === "idle" && (
            <Button size="lg" onClick={r.start} className="h-16 w-16 rounded-full">
              <Mic className="h-6 w-6" />
            </Button>
          )}
          {r.state === "recording" && (
            <Button size="lg" variant="destructive" onClick={r.stop} className="h-16 w-16 rounded-full">
              <Square className="h-5 w-5 fill-current" />
            </Button>
          )}
          {r.state === "stopped" && (
            <Button size="sm" variant="outline" onClick={r.reset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Re-record
            </Button>
          )}
        </div>

        {r.state === "stopped" && (
          <>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Title</p>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Coffee with Maya"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI summary</p>
              {transcribing ? (
                <p className="text-sm italic text-muted-foreground">Generating…</p>
              ) : (
                <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Transcript</p>
              {transcribing ? (
                <p className="text-sm italic text-muted-foreground">Transcribing…</p>
              ) : (
                <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6} />
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Attendees
              </p>
              <input
                type="search"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Add contacts…"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              />
              <div className="max-h-56 overflow-auto rounded-md bg-card hairline border">
                {(contacts ?? []).map((c) => {
                  const sel = selectedContacts.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        setSelectedContacts((prev) =>
                          prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                        )
                      }
                      className={`flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2 ${sel ? "bg-surface-2" : ""}`}
                    >
                      <span>{c.full_name}</span>
                      <span className="text-xs text-muted-foreground">{sel ? "✓" : (c.company ?? "")}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={save} disabled={saving || transcribing} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving…" : "Save meeting"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
