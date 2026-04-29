import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getTheme, setTheme as applyTheme } from "@/lib/theme";
import { Cable, LogOut, Sun, Moon, Tag, Plus, X, Building2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { KismetMark } from "@/components/KismetMark";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [retention, setRetention] = useState<string>("0");
  const [dark, setDark] = useState(getTheme() === "dark");
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name, audio_retention_days").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name ?? "");
          setRetention(String(data.audio_retention_days ?? 0));
        }
      });
    supabase.from("tags").select("id, name, color").order("name").then(({ data }) => setTags(data ?? []));
  }, [user]);

  async function saveProfile() {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      audio_retention_days: parseInt(retention, 10),
    }).eq("user_id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  async function addTag() {
    if (!user || !newTag.trim()) return;
    const { data, error } = await supabase
      .from("tags")
      .insert({ user_id: user.id, name: newTag.trim(), color: "#d97706" })
      .select("id, name, color").single();
    if (error) { toast.error(error.message); return; }
    setTags((t) => [...t, data!]);
    setNewTag("");
  }
  async function removeTag(id: string) {
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTags((t) => t.filter((x) => x.id !== id));
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
      >
        <div className="flex items-center gap-2">
          <KismetMark size={20} />
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        </div>
      </header>

      <div className="space-y-6 px-4 py-5">
        {/* Profile */}
        <Group title="Profile">
          <Field label="Email">
            <Input value={user?.email ?? ""} disabled />
          </Field>
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        </Group>

        {/* Appearance */}
        <Group title="Appearance">
          <div className="flex items-center justify-between rounded-md bg-card hairline border px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {dark ? "Dark mode" : "Warm light"}
            </div>
            <Switch
              checked={dark}
              onCheckedChange={(v) => { setDark(v); applyTheme(v ? "dark" : "light"); }}
            />
          </div>
        </Group>

        {/* Audio retention */}
        <Group title="Recordings">
          <Field label="Keep raw audio">
            <Select value={retention} onValueChange={setRetention}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Forever</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="-1">Delete after transcribe</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Group>

        {/* Organizations */}
        <Group title="Organizations">
          <Link
            to="/organizations"
            className="flex items-center justify-between rounded-md bg-card hairline border px-3 py-2.5 hover:bg-accent/40"
          >
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-primary" />
              Manage organizations
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </Group>

        {/* Tags */}
        <Group title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs">
                <Tag className="h-3 w-3" style={{ color: t.color }} /> {t.name}
                <button onClick={() => removeTag(t.id)} aria-label="Remove tag" className="text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {tags.length === 0 && <p className="text-xs text-muted-foreground">No tags yet.</p>}
          </div>
          <div className="flex gap-2">
            <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag name" />
            <Button type="button" onClick={addTag}><Plus className="h-4 w-4" /></Button>
          </div>
        </Group>

        {/* Integrations */}
        <Group title="Integrations">
          <FirefliesCard userId={user?.id} />
          <CalendarCard userId={user?.id} />
          <GmailCard />
          <div className="opacity-50 pointer-events-none select-none">
            <div className="flex items-center justify-between rounded-md bg-card hairline border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Zoom</p>
                <p className="text-[11px] text-muted-foreground">Pull recordings + participants — coming soon</p>
              </div>
              <Cable className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </Group>

        <Button onClick={saveProfile} className="w-full bg-gradient-kismet text-primary-foreground hover:opacity-90">Save settings</Button>

        <Button variant="ghost" onClick={signOut} className="w-full text-destructive hover:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FirefliesCard({ userId }: { userId?: string }) {
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState<{ synced: number; linked: number; created: number } | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from("sync_state").select("last_synced_at")
      .eq("user_id", userId).eq("provider", "fireflies").maybeSingle()
      .then(({ data }) => setLastSynced(data?.last_synced_at ?? null));
  }, [userId, syncing]);

  async function sync() {
    setSyncing(true);
    setStats(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-fireflies", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStats({
        synced: data?.synced ?? 0,
        linked: data?.linked_to_existing ?? 0,
        created: data?.created_contacts ?? 0,
      });
      toast.success(`Synced ${data?.synced ?? 0} transcripts`);
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-md bg-card hairline border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Fireflies</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {lastSynced
              ? `Last synced ${new Date(lastSynced).toLocaleString()}`
              : "Not synced yet"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>
      {stats && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {stats.synced} transcripts · {stats.linked} linked to meetings · {stats.created} new contacts
        </p>
      )}
    </div>
  );
}

function CalendarCard({ userId }: { userId?: string }) {
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase.from("sync_state").select("last_synced_at")
      .eq("user_id", userId).eq("provider", "google_calendar").maybeSingle()
      .then(({ data }) => setLastSynced(data?.last_synced_at ?? null));
  }, [userId, syncing]);

  async function sync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-calendar", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const events = data?.synced ?? data?.events ?? 0;
      const staged = data?.staged ?? data?.pending ?? 0;
      toast.success(`Synced ${events} events, ${staged} staged for review.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-md bg-card hairline border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Google Calendar</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {lastSynced ? `Last synced ${new Date(lastSynced).toLocaleString()}` : "Not synced yet"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>
      <Link to="/import/calendar" className="mt-2 inline-block text-[11px] text-primary hover:underline">
        Review staged events →
      </Link>
    </div>
  );
}

function GmailCard() {
  return (
    <div className="rounded-md bg-card hairline border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Gmail</p>
          <p className="truncate text-[11px] text-muted-foreground">Surface contact email history</p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link to="/import/gmail">Browse recent inbox</Link>
        </Button>
      </div>
    </div>
  );
}

