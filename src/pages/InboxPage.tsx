import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import TriggersPage from "./TriggersPage";
import MemoryInboxPage from "./MemoryInboxPage";

type Tab = "triggers" | "memories";

export default function InboxPage() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get("tab") as Tab) === "memories" ? "memories" : "triggers";
  const [tab, setTab] = useState<Tab>(initial);

  useEffect(() => {
    setParams(tab === "memories" ? { tab: "memories" } : {}, { replace: true });
  }, [tab, setParams]);

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        </div>
        <div className="px-4 pb-3">
          <div className="inline-flex w-full rounded-lg bg-secondary p-1">
            {(["triggers", "memories"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  tab === t
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      {tab === "triggers" ? <TriggersPage embedded /> : <MemoryInboxPage embedded />}
    </div>
  );
}
