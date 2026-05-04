import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "kismet:install-dismissed-at";
const DISMISS_DAYS = 7;

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function recentlyDismissed() {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const ts = Number(v);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    if (!isMobile() || isStandalone() || recentlyDismissed()) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS doesn't fire beforeinstallprompt — show manual hint after a short delay
    let t: number | undefined;
    if (isIOS()) {
      t = window.setTimeout(() => setVisible(true), 1500);
    }

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) window.clearTimeout(t);
    };
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
    setShowIosSheet(false);
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
      }
      setDeferred(null);
      return;
    }
    if (isIOS()) {
      setShowIosSheet(true);
    }
  }

  if (!visible) return null;

  return (
    <>
      {/* Banner */}
      <div
        className={cn(
          "fixed inset-x-0 z-50 px-3",
          "animate-in slide-in-from-bottom-4 duration-300",
        )}
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 9rem)" }}
        role="dialog"
        aria-label="Install Kismet"
      >
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-kismet text-primary-foreground">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight">Install Kismet</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">
              Add to your home screen for the full app experience.
            </p>
          </div>
          <Button
            size="sm"
            onClick={install}
            className="bg-gradient-kismet text-primary-foreground hover:opacity-90"
          >
            Install
          </Button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* iOS instruction sheet */}
      {showIosSheet && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-background/70 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-t-2xl border-t border-border bg-card p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Add to Home Screen</h2>
              <button onClick={() => setShowIosSheet(false)} aria-label="Close">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">1</span>
                <span className="flex items-center gap-1.5">
                  Tap the <Share className="h-4 w-4 inline" /> Share button in Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">2</span>
                <span className="flex items-center gap-1.5">
                  Choose <Plus className="h-4 w-4 inline" /> <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">3</span>
                <span>Tap <strong>Add</strong> — Kismet will appear on your home screen.</span>
              </li>
            </ol>
            <Button onClick={dismiss} variant="outline" className="mt-5 w-full">
              Got it
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
