import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, Search, Settings, Plus, ScanLine, Mic, UserPlus, Radio, X, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [fabOpen, setFabOpen] = useState(false);

  const { data: pendingMemories } = useQuery({
    queryKey: ["pending-memory-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("suggested_memories")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Close FAB on route change
  useEffect(() => { setFabOpen(false); }, [location.pathname]);

  // Close FAB on Escape
  useEffect(() => {
    if (!fabOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFabOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fabOpen]);

  const tabs: Array<{ to: string; icon: typeof Home; label: string; badge?: number }> = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/search", icon: Search, label: "Search" },
    { to: "/inbox/memories", icon: Sparkles, label: "Memories", badge: pendingMemories ?? 0 },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  const fabActions: Array<{ to: string; icon: typeof Plus; label: string; rx: string; ry: string }> = [
    { to: "/capture/scan", icon: ScanLine, label: "Scan card", rx: "-90px", ry: "-20px" },
    { to: "/capture/voice", icon: Mic, label: "Voice note", rx: "-60px", ry: "-80px" },
    { to: "/contact/new", icon: UserPlus, label: "Add contact", rx: "10px", ry: "-100px" },
    { to: "/capture/meeting", icon: Radio, label: "Record meeting", rx: "70px", ry: "-60px" },
  ];

  return (
    <div className="relative flex h-full min-h-screen flex-col bg-background">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/85 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active =
              t.to === "/" ? location.pathname === "/" : location.pathname.startsWith(t.to);
            return (
              <button
                key={t.to}
                onClick={() => navigate(t.to)}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
                aria-label={t.label}
              >
                <Icon className="h-5 w-5" />
                {t.badge && t.badge > 0 ? (
                  <span className="absolute right-1 top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gradient-kismet px-1 text-[9px] font-semibold text-primary-foreground">
                    {t.badge > 99 ? "99+" : t.badge}
                  </span>
                ) : null}
                <span className="text-[10px] font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* FAB + radial menu */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-50",
          fabOpen ? "pointer-events-auto" : ""
        )}
      >
        {/* Backdrop */}
        <div
          onClick={() => setFabOpen(false)}
          className={cn(
            "absolute inset-0 bg-background/60 backdrop-blur-sm transition-opacity",
            fabOpen ? "opacity-100" : "opacity-0"
          )}
        />

        {/* Radial actions */}
        <div
          className="absolute"
          style={{ right: "1.5rem", bottom: `calc(env(safe-area-inset-bottom) + 5.5rem)` }}
        >
          {fabActions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={a.to}
                onClick={() => navigate(a.to)}
                className={cn(
                  "absolute right-0 bottom-0 flex h-12 w-12 items-center justify-center rounded-full bg-card text-foreground elevation-2 transition-all hairline border",
                  fabOpen
                    ? "opacity-100"
                    : "pointer-events-none translate-x-0 translate-y-0 opacity-0 scale-50"
                )}
                style={
                  fabOpen
                    ? ({
                        transform: `translate(${a.rx}, ${a.ry})`,
                        transitionDelay: `${i * 35}ms`,
                        transitionDuration: "220ms",
                      } as React.CSSProperties)
                    : undefined
                }
                aria-label={a.label}
                title={a.label}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>

        {/* Main FAB */}
        <button
          onClick={() => setFabOpen((v) => !v)}
          className="absolute flex h-14 w-14 items-center justify-center rounded-full bg-gradient-kismet text-primary-foreground fab-shadow transition-transform"
          style={{
            right: "1.5rem",
            bottom: `calc(env(safe-area-inset-bottom) + 5rem)`,
            transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
          }}
          aria-label={fabOpen ? "Close menu" : "New entry"}
        >
          {fabOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>
      </div>
    </div>
  );
}
