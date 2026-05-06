import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, Users, Settings, Plus, ScanLine, Mic, UserPlus, Radio, Inbox, Calendar, Mail, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: inboxCount } = useQuery({
    queryKey: ["inbox-count"],
    queryFn: async () => {
      const [m, c, co] = await Promise.all([
        supabase.from("suggested_memories").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("contact_events").select("id", { count: "exact", head: true }).is("dismissed_at", null),
        supabase.from("company_events").select("id", { count: "exact", head: true }).is("dismissed_at", null),
      ]);
      return (m.count ?? 0) + (c.count ?? 0) + (co.count ?? 0);
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  type Tab = { to: string; icon: typeof Home; label: string; badge?: number; match: (p: string) => boolean };
  const tabs: Tab[] = [
    { to: "/", icon: Home, label: "Home", match: (p) => p === "/" },
    { to: "/contacts", icon: Users, label: "Contacts", match: (p) => p.startsWith("/contacts") || p.startsWith("/contact/") || p.startsWith("/organizations") },
    { to: "/inbox", icon: Inbox, label: "Inbox", badge: inboxCount ?? 0, match: (p) => p.startsWith("/inbox") || p.startsWith("/triggers") },
    { to: "/settings", icon: Settings, label: "Settings", match: (p) => p.startsWith("/settings") },
  ];

  type Action = { to: string; icon: typeof Plus; label: string; hint?: string };
  const primaryActions: Action[] = [
    { to: "/contact/new", icon: UserPlus, label: "Add contact", hint: "Enter details manually" },
    { to: "/capture/scan", icon: ScanLine, label: "Scan business card", hint: "Capture with the camera" },
    { to: "/capture/voice", icon: Mic, label: "Voice note", hint: "Record a quick thought" },
    { to: "/capture/meeting", icon: Radio, label: "Record meeting", hint: "Live transcribe a conversation" },
  ];
  const importActions: Action[] = [
    { to: "/import/calendar", icon: Calendar, label: "Import from calendar", hint: "Review recent events" },
    { to: "/import/gmail", icon: Mail, label: "Import from Gmail", hint: "Push a sender to your CRM" },
  ];

  const go = (to: string) => {
    setSheetOpen(false);
    navigate(to);
  };

  return (
    <div className="relative flex h-full min-h-screen flex-col bg-background">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      {/* Bottom nav with center [+] */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/85 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pb-1.5 pt-1">
          {/* Left tabs */}
          {tabs.slice(0, 2).map((t) => (
            <TabButton key={t.to} tab={t} active={t.match(location.pathname)} onClick={() => navigate(t.to)} />
          ))}

          {/* Center [+] */}
          <div className="flex items-center justify-center">
            <button
              onClick={() => setSheetOpen(true)}
              aria-label="New entry"
              className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-kismet text-primary-foreground fab-shadow transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          {/* Right tabs */}
          {tabs.slice(2).map((t) => (
            <TabButton key={t.to} tab={t} active={t.match(location.pathname)} onClick={() => navigate(t.to)} />
          ))}
        </div>
      </nav>

      {/* Action sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-t bg-card p-0"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <div className="px-4 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Capture
          </div>
          <div className="bg-card hairline border-y divide-y divide-border">
            {primaryActions.map((a) => (
              <ActionRow key={a.to} action={a} onClick={() => go(a.to)} />
            ))}
          </div>
          <div className="px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Import
          </div>
          <div className="bg-card hairline border-y divide-y divide-border">
            {importActions.map((a) => (
              <ActionRow key={a.to} action={a} onClick={() => go(a.to)} />
            ))}
          </div>
          <div className="h-3" />
        </SheetContent>
      </Sheet>

      <InstallPrompt />
    </div>
  );
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: { icon: typeof Home; label: string; badge?: number };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      aria-label={tab.label}
    >
      <Icon className="h-5 w-5" />
      {tab.badge && tab.badge > 0 ? (
        <span className="absolute right-1 top-0 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gradient-kismet px-1 text-[9px] font-semibold text-primary-foreground">
          {tab.badge > 99 ? "99+" : tab.badge}
        </span>
      ) : null}
      <span className="text-[10px] font-medium">{tab.label}</span>
    </button>
  );
}

function ActionRow({
  action,
  onClick,
}: {
  action: { icon: typeof Plus; label: string; hint?: string };
  onClick: () => void;
}) {
  const Icon = action.icon;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 active:bg-accent/60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{action.label}</p>
        {action.hint && <p className="text-xs text-muted-foreground">{action.hint}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
