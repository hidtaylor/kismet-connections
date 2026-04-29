import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KismetMark } from "@/components/KismetMark";
import { toast } from "sonner";
import { useEffect } from "react";

export default function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: true,
      },
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-3">
          <KismetMark size={56} />
          <h1 className="text-2xl font-semibold tracking-tight">Kismet</h1>
          <p className="text-sm text-muted-foreground text-center text-balance">
            Remember the people who matter, when it matters.
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-sm font-medium">Check your email</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a sign-in link to <span className="text-foreground">{email}</span>.
            </p>
            <Button
              variant="ghost"
              className="mt-4 text-xs"
              onClick={() => { setSent(false); setEmail(""); }}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <Input
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base"
            />
            <Button type="submit" className="h-12 w-full text-base" disabled={sending}>
              {sending ? "Sending…" : "Send magic link"}
            </Button>
            <p className="pt-2 text-center text-xs text-muted-foreground">
              No password. We'll email you a one-tap sign-in link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
