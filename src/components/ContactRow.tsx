import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, relTime, isOverdue } from "@/lib/format";
import { Building2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface ContactRowProps {
  contact: {
    id: string;
    full_name: string;
    company: string | null;
    title: string | null;
    photo_url: string | null;
    last_contact_at: string | null;
    cadence: string | null;
  };
  showOverdue?: boolean;
}

export function ContactRow({ contact, showOverdue }: ContactRowProps) {
  const overdue = isOverdue(contact.last_contact_at, contact.cadence);
  return (
    <Link
      to={`/contact/${contact.id}`}
      className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-2 active:bg-surface-3 transition-colors"
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={contact.photo_url ?? undefined} alt="" />
        <AvatarFallback className="bg-secondary text-xs font-medium">
          {initials(contact.full_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium">{contact.full_name}</p>
          {showOverdue && overdue && (
            <span title="Past cadence">
              <AlertCircle className="h-3 w-3 shrink-0 text-warning" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {contact.company ? (
            <>
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {contact.title ? `${contact.title} · ${contact.company}` : contact.company}
              </span>
            </>
          ) : contact.title ? (
            <span className="truncate">{contact.title}</span>
          ) : (
            <span className="text-muted-foreground/60">No company</span>
          )}
        </div>
      </div>
      <span className={cn("shrink-0 text-xs", overdue ? "text-warning" : "text-muted-foreground/70")}>
        {relTime(contact.last_contact_at)}
      </span>
    </Link>
  );
}
