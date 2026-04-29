import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Mic, Square, RotateCcw, Save } from "lucide-react";
import { useAudioRecorder, LevelMeter, fmtDuration } from "@/lib/recorder";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

type Sensitivity = "normal" | "sensitive" | "private";

export default function VoiceNotePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const r = useAudioRecorder();
  const [transcript, setTranscript] = useState("");
  const [linking, setLinking] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("normal");

  const { data: contacts } = useQuery({
    queryKey: ["contacts-pick", contactQuery],
    queryFn: async () => {
      let q = supabase.from("contacts").select("id, full_name, company").order("full_name").limit(20);
      if (contactQuery.trim())
        q = q.or(`full_name.ilike.%${contactQuery}%,company.ilike.%${contactQuery}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: r.state === "stopped",
  });

  // After recording stops, upload + transcribe
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
          body: { storage_path: path, duration_seconds: r.duration, kind: "note" },
        });
        if (error) throw error;
        setTranscript(data?.transcript ?? "");
      } catch (e: any) {
        toast.error(e?.message ?? "Transcription failed");
      } finally {
        setTranscribing(false);
      }
    })();
  }, [r.state, r.blob, user, r.duration, storagePath]);

  async function save() {
    if (!user || !storagePath) return;
    setLinking(true);
    const { data: signed } = await supabase.storage.from("recordings").createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    // If attached to a contact and there's a transcript worth analyzing, create a lightweight
    // interaction so suggested-memories has something to attach to.
    let interactionId: string | null = null;
    if (contactId && transcript && transcript.length > 200) {
      const { data: ix, error: ixErr } = await supabase
        .from("interactions")
        .insert({
          user_id: user.id,
          title: "Voice note",
          type: "other",
          occurred_at: new Date().toISOString(),
        })
        .select("id").single();
      if (ixErr) { setLinking(false); toast.error(ixErr.message); return; }
      interactionId = ix.id;

      await supabase.from("interaction_contacts").insert({
        user_id: user.id,
        interaction_id: interactionId,
        contact_id: contactId,
      });

      // Persist transcript on a recordings row so extract-memories can read it server-side
      await supabase.from("recordings").insert({
        user_id: user.id,
        interaction_id: interactionId,
        storage_path: storagePath,
        duration_seconds: r.duration,
        transcript_text: transcript,
        transcript_status: "done",
        consent_disclosed: true,
      });
    }

    const { error } = await supabase.from("notes").insert({
      user_id: user.id,
      contact_id: contactId,
      interaction_id: interactionId,
      body_md: "",
      voice_url: signed?.signedUrl ?? null,
      transcript,
      provenance: "user_memory",
      sensitivity,
      confirmed_at: new Date().toISOString(),
    });
    if (error) { setLinking(false); toast.error(error.message); return; }

    if (contactId) {
      await supabase.from("contacts").update({ last_contact_at: new Date().toISOString() }).eq("id", contactId);
    }

    // Fire-and-forget memory extraction (transcript fetched server-side from recordings)
    if (interactionId) {
      supabase.functions.invoke("extract-memories", {
        body: { interaction_id: interactionId },
      }).catch(() => {});
    }

    setLinking(false);
    toast.success("Saved");
    navigate(contactId ? `/contact/${contactId}` : "/", { replace: true });
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
        <h1 className="text-sm font-medium">Voice note</h1>
        <div className="w-10" />
      </header>

      <div className="space-y-6 px-4 py-6">
        {/* Recorder */}
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
            {/* Transcript */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Transcript
              </p>
              {transcribing ? (
                <p className="text-sm text-muted-foreground italic">Transcribing…</p>
              ) : (
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={6}
                  placeholder="Transcript will appear here. You can edit it."
                />
              )}
            </div>

            {/* Contact picker */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Attach to contact (optional)
              </p>
              <input
                type="search"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Search contacts…"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              />
              <div className="max-h-56 overflow-auto rounded-md bg-card hairline border">
                {(contacts ?? []).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setContactId(c.id === contactId ? null : c.id)}
                    className={`flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2 ${contactId === c.id ? "bg-surface-2" : ""}`}
                  >
                    <span>{c.full_name}</span>
                    <span className="text-xs text-muted-foreground">{c.company ?? ""}</span>
                  </button>
                ))}
                {(contacts ?? []).length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">No matches.</p>
                )}
              </div>
            </div>

            {/* Sensitivity */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sensitivity
              </p>
              <select
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value as Sensitivity)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="normal">Normal — included in AI summaries</option>
                <option value="sensitive">Sensitive — excluded from AI</option>
                <option value="private">Private — excluded from AI</option>
              </select>
            </div>

            <Button onClick={save} disabled={linking || transcribing} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {linking ? "Saving…" : "Save note"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
