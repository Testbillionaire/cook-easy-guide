import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recordEmailInterest } from "@/lib/analytics.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — What 2 Cook" },
      { name: "description", content: "Sign in to save recipes to your account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const registerInterest = useServerFn(recordEmailInterest);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/saved" });
    });
  }, [navigate]);

  // Email sign-in is intentionally not wired to Supabase OTP yet: the built-in
  // email service can't send a branded 6-digit code and caps at a handful of
  // sends per hour. Until custom SMTP is set up we record the interest instead
  // so we can size the demand and tell these people when it's ready.
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await registerInterest({ data: { email } });
    } catch {
      // Never block the notice on the logging call — the user still needs to
      // know email sign-in isn't available.
    } finally {
      setLoading(false);
      setNotifyOpen(true);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setMsg(null);
    // Supabase performs a full-page redirect to Google, so nothing below runs
    // on success — the browser lands back on `redirectTo` with a session.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/saved` },
    });
    if (error) {
      setMsg(error.message ?? "Google sign-in failed.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="font-display text-xl font-semibold tracking-tight">What 2 Cook</span>
        </Link>
      </header>

      <main className="mx-auto max-w-md px-5 pt-12">
        <h1 className="font-display text-3xl font-medium md:text-4xl">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Google to save recipes to your account.
        </p>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold transition hover:bg-secondary disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or email
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-warm transition hover:translate-y-[-1px] disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue with email
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Email sign-in is coming soon — Google works today.
          </p>
        </form>

        {msg && <p className="mt-4 rounded-xl bg-secondary p-3 text-sm">{msg}</p>}
      </main>

      <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <div className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <MailCheck className="h-5 w-5" />
            </div>
            <DialogTitle className="font-display text-xl">Email sign-in isn't ready yet</DialogTitle>
            <DialogDescription className="pt-1 text-sm leading-relaxed">
              We're still building out secure sign-in for non-Google email addresses.
              We've noted your interest and will let you know at{" "}
              <span className="font-medium text-foreground">{email}</span> once it's
              available.
              <br />
              <br />
              In the meantime, <strong className="text-foreground">Continue with Google</strong> works
              right now and gets you straight to saving recipes.
            </DialogDescription>
          </DialogHeader>
          <button
            onClick={() => setNotifyOpen(false)}
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:translate-y-[-1px]"
          >
            Got it
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
