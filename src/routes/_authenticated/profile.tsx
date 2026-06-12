import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChefHat, Heart, LogOut, Shield, User, MapPin, Search, Bookmark, ArrowLeft } from "lucide-react";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { getZip, setZip } from "@/lib/zip-store";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Pantry" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getMyProfile);
  const { data, isLoading } = useQuery({ queryKey: ["my-profile"], queryFn: () => fn() });

  const [zip, setZipState] = useState("");
  useEffect(() => { setZipState(getZip()); }, []);

  const saveZip = () => { setZip(zip); };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--gradient-warm)] text-primary-foreground shadow-warm">
            <ChefHat className="h-4.5 w-4.5" strokeWidth={2.4} />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">Pantry</span>
        </Link>
        <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-10">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back home
        </Link>
        <h1 className="font-display text-3xl font-medium md:text-4xl">Your profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Account details and activity at a glance.</p>

        {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

        {data && (
          <>
            <section className="mt-8 rounded-3xl border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
                  <User className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl">{data.email ?? "—"}</h2>
                    {data.isAdmin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Shield className="h-3 w-3" /> ADMIN
                      </span>
                    )}
                    {data.disabled && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">DISABLED</span>
                    )}
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <div><dt className="inline font-semibold">Joined: </dt><dd className="inline">{data.created_at ? new Date(data.created_at).toLocaleDateString() : "—"}</dd></div>
                    <div><dt className="inline font-semibold">Last seen: </dt><dd className="inline">{data.last_seen_at ? new Date(data.last_seen_at).toLocaleString() : "—"}</dd></div>
                  </dl>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-4 sm:grid-cols-2">
              <Stat icon={Search} label="Searches" value={data.searchCount} />
              <Stat icon={Bookmark} label="Saved recipes" value={data.savedCount} />
            </section>

            <section className="mt-6 rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h3 className="font-display text-lg">Your ZIP</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Used to surface trending searches near you. Stored only in this browser.</p>
              <div className="mt-3 flex gap-2">
                <input
                  value={zip}
                  onChange={(e) => setZipState(e.target.value)}
                  placeholder="e.g. 10001"
                  className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
                />
                <button onClick={saveZip} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:translate-y-[-1px]">
                  Save
                </button>
              </div>
            </section>

            <section className="mt-6 flex flex-wrap gap-2">
              <Link to="/saved" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-secondary">
                <Heart className="h-3.5 w-3.5" /> Your saved recipes
              </Link>
              {data.isAdmin && (
                <Link to="/admin" className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20">
                  <Shield className="h-3.5 w-3.5" /> Admin dashboard
                </Link>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Search; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 font-display text-3xl">{value.toLocaleString()}</p>
    </div>
  );
}
