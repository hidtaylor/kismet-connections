import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type OrgKind = "brokerage" | "association" | "vendor" | "portal" | "mls" | "startup" | "other";

type Form = {
  name: string;
  kind: OrgKind;
  website: string;
  notes: string;
};

const empty: Form = { name: "", kind: "other", website: "", notes: "" };

export default function OrganizationEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = !id;
  const [form, setForm] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["org-edit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !isNew,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name ?? "",
        kind: (existing.kind as OrgKind) ?? "other",
        website: existing.website ?? "",
        notes: existing.notes ?? "",
      });
    }
  }, [existing]);

  async function save() {
    if (!user) return;
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const payload = { ...form, user_id: user.id };
    if (isNew) {
      const { data, error } = await supabase.from("organizations").insert(payload).select("id").single();
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Organization created");
      navigate(`/organizations/${data.id}`, { replace: true });
    } else {
      const { error } = await supabase.from("organizations").update(payload).eq("id", id!);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Saved");
      navigate(`/organizations/${id}`, { replace: true });
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
        <h1 className="text-sm font-medium">{isNew ? "New organization" : "Edit organization"}</h1>
        <Button size="sm" onClick={save} disabled={saving} className="bg-gradient-kismet text-primary-foreground hover:opacity-90">
          {saving ? "Saving…" : "Save"}
        </Button>
      </header>

      <div className="space-y-5 px-4 py-5">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Name <span className="text-destructive">*</span></Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Kind</Label>
          <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as OrgKind })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="brokerage">Brokerage</SelectItem>
              <SelectItem value="association">Association</SelectItem>
              <SelectItem value="mls">MLS</SelectItem>
              <SelectItem value="portal">Portal</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="startup">Startup</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Website</Label>
          <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} />
        </div>
      </div>
    </div>
  );
}
