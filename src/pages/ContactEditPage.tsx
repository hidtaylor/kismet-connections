import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Camera, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { OrgTypeahead } from "@/components/OrgTypeahead";
import { writeContactFields } from "@/lib/contact-write";

type Form = {
  full_name: string;
  first_name: string;
  last_name: string;
  company: string;
  organization_id: string | null;
  title: string;
  emails: string[];
  phones: string[];
  photo_url: string | null;
  linkedin_url: string;
  twitter_url: string;
  website_url: string;
  location: string;
  cadence: "close" | "monthly" | "quarterly" | "annual" | "none";
};

const empty: Form = {
  full_name: "",
  first_name: "",
  last_name: "",
  company: "",
  organization_id: null,
  title: "",
  emails: [],
  phones: [],
  photo_url: null,
  linkedin_url: "",
  twitter_url: "",
  website_url: "",
  location: "",
  cadence: "none",
};

export default function ContactEditPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<Form>(empty);
  const [prefillSnapshot, setPrefillSnapshot] = useState<Partial<Form> | null>(null);
  const [saving, setSaving] = useState(false);
  const isNew = !id;

  // Pre-fill from scan-card flow; remember the prefill so we can detect edits.
  useEffect(() => {
    const prefill = params.get("prefill");
    if (prefill) {
      try {
        const data = JSON.parse(decodeURIComponent(prefill));
        setForm((f) => ({ ...f, ...data, emails: data.emails ?? [], phones: data.phones ?? [] }));
        setPrefillSnapshot({ ...data, emails: data.emails ?? [], phones: data.phones ?? [] });
      } catch { /* ignore */ }
    }
  }, [params]);

  const { data: existing } = useQuery({
    queryKey: ["contact-edit", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !isNew,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        full_name: existing.full_name ?? "",
        first_name: existing.first_name ?? "",
        last_name: existing.last_name ?? "",
        company: existing.company ?? "",
        organization_id: (existing as any).organization_id ?? null,
        title: existing.title ?? "",
        emails: Array.isArray(existing.emails) ? (existing.emails as any) : [],
        phones: Array.isArray(existing.phones) ? (existing.phones as any) : [],
        photo_url: existing.photo_url,
        linkedin_url: existing.linkedin_url ?? "",
        twitter_url: existing.twitter_url ?? "",
        website_url: existing.website_url ?? "",
        location: existing.location ?? "",
        cadence: (existing.cadence as Form["cadence"]) ?? "none",
      });
    }
  }, [existing]);

  async function uploadPhoto(file: File) {
    if (!user) return;
    const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("contact-photos").upload(path, file, { upsert: false });
    if (error) { toast.error(error.message); return; }
    const { data } = await supabase.storage.from("contact-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
    setForm((f) => ({ ...f, photo_url: data?.signedUrl ?? null }));
  }

  async function save() {
    if (!user) return;
    if (!form.full_name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      user_id: user.id,
      emails: form.emails.filter(Boolean),
      phones: form.phones.filter(Boolean),
    };
    if (isNew) {
      const { data, error } = await supabase.from("contacts").insert(payload).select("id").single();
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Contact added");
      navigate(`/contact/${data.id}`, { replace: true });
    } else {
      const { error } = await supabase.from("contacts").update(payload).eq("id", id!);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Saved");
      navigate(`/contact/${id}`, { replace: true });
    }
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
        <h1 className="text-sm font-medium">{isNew ? "New contact" : "Edit contact"}</h1>
        <Button size="sm" onClick={save} disabled={saving} className="bg-gradient-kismet text-primary-foreground hover:opacity-90">
          {saving ? "Saving…" : "Save"}
        </Button>
      </header>

      <div className="space-y-5 px-4 py-5">
        {/* Photo */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={form.photo_url ?? undefined} />
            <AvatarFallback>{initials(form.full_name || "?")}</AvatarFallback>
          </Avatar>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs">
            <Camera className="h-3.5 w-3.5" /> Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
            />
          </label>
        </div>

        <Field label="Full name" required>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Company">
          <OrgTypeahead
            value={{ organization_id: form.organization_id, company: form.company }}
            onChange={(v) => setForm({ ...form, organization_id: v.organization_id, company: v.company })}
          />
        </Field>

        <ListField
          label="Emails"
          values={form.emails}
          onChange={(v) => setForm({ ...form, emails: v })}
          placeholder="name@example.com"
          inputType="email"
        />
        <ListField
          label="Phones"
          values={form.phones}
          onChange={(v) => setForm({ ...form, phones: v })}
          placeholder="+1 555 555 5555"
          inputType="tel"
        />

        <Field label="Location">
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City, country" />
        </Field>

        <Field label="LinkedIn">
          <Input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
        </Field>
        <Field label="Twitter / X">
          <Input value={form.twitter_url} onChange={(e) => setForm({ ...form, twitter_url: e.target.value })} />
        </Field>
        <Field label="Website">
          <Input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
        </Field>

        <Field label="Cadence">
          <Select value={form.cadence} onValueChange={(v) => setForm({ ...form, cadence: v as Form["cadence"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No reminder</SelectItem>
              <SelectItem value="close">Close — every 2 weeks</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ListField({
  label, values, onChange, placeholder, inputType,
}: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string; inputType?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <Input
              type={inputType ?? "text"}
              value={v}
              placeholder={placeholder}
              onChange={(e) => {
                const c = [...values]; c[i] = e.target.value; onChange(c);
              }}
            />
            <Button
              type="button" variant="ghost" size="icon"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ""])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}
