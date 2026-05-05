import { Button } from "@/components/ui/button";
import { Mail, Phone, Linkedin, Building2, User } from "lucide-react";

export type Alias = {
  alias_type: string;
  alias_value: string;
  source: string;
};

const ICONS: Record<string, typeof Mail> = {
  email: Mail,
  phone: Phone,
  linkedin: Linkedin,
  employer: Building2,
  name: User,
};

export function AliasList({
  aliases,
  onMakePrimary,
}: {
  aliases: Alias[];
  onMakePrimary?: (alias: Alias) => void;
}) {
  if (!aliases || aliases.length === 0) return null;
  return (
    <section className="px-4 pb-4">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Also known as
      </h2>
      <div className="rounded-lg bg-card hairline border divide-y divide-border">
        {aliases.map((a, idx) => {
          const I = ICONS[a.alias_type] ?? User;
          const promotable = ["email", "phone", "linkedin"].includes(a.alias_type);
          return (
            <div key={`${a.alias_type}-${a.alias_value}-${idx}`} className="flex items-center gap-3 px-3 py-2">
              <I className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{a.alias_value}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {a.alias_type} · {a.source}
                </p>
              </div>
              {promotable && onMakePrimary && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onMakePrimary(a)}>
                  Make primary
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
