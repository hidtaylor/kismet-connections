import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KismetMark } from "@/components/KismetMark";
import { toast } from "sonner";

export default function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const [pwEmail, setPwEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  async function sendMagic(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    });
    setSending(false);
    if (error) return toast.error(error.message);
    setSent(true);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: pwEmail.trim(),
      password,
    });
    setPwBusy(false);
    if (error) toast.error(error.message);
  }

  async function signUp() {
    if (!pwEmail.trim() || !password) return toast.error("Email and password required");
    setPwBusy(true);
    const { error } = await supabase.auth.signUp({
      email: pwEmail.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setPwBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — signing in…");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-3">
          <KismetMark size={56} />
          <h1 className="text-2xl font-semibold tracking-tight text-gradient-kismet">Kismet</h1>
          <p className="text-sm text-muted-foreground text-center text-balance">
            Remember the people who matter, when it matters.
          </p>
        </div>

        <Tabs defaultValue="magic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="magic">Magic link</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>

          <TabsContent value="magic" className="mt-4">
            {sent ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center">
                <p className="text-sm font-medium">Check your email</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent a sign-in link to <span className="text-foreground">{email}</span>.
                </p>
                <Button variant="ghost" className="mt-4 text-xs" onClick={() => { setSent(false); setEmail(""); }}>
                  Use a different email
                </Button>
              </div>
            ) : (
              <form onSubmit={sendMagic} className="space-y-3">
                <Input
                  type="email" required autoComplete="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base"
                />
                <Button type="submit" className="h-12 w-full text-base bg-gradient-kismet text-primary-foreground hover:opacity-90" disabled={sending}>
                  {sending ? "Sending…" : "Send magic link"}
                </Button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="password" className="mt-4">
            <form onSubmit={signIn} className="space-y-3">
              <Input
                type="email" required autoComplete="email" placeholder="you@example.com"
                value={pwEmail} onChange={(e) => setPwEmail(e.target.value)} className="h-12 text-base"
              />
              <Input
                type="password" required autoComplete="current-password" placeholder="Password"
                value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base"
              />
              <Button type="submit" className="h-12 w-full text-base bg-gradient-kismet text-primary-foreground hover:opacity-90" disabled={pwBusy}>
                {pwBusy ? "…" : "Sign in"}
              </Button>
              <Button type="button" variant="ghost" className="w-full text-xs" onClick={signUp} disabled={pwBusy}>
                Create account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
