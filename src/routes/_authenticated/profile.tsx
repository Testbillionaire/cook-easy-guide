import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut, Shield, User, MapPin, Search, Bookmark, ArrowLeft, SlidersHorizontal, ChevronRight } from "lucide-react";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { getZip, setZip } from "@/lib/zip-store";
import { INGREDIENT_BY_KEY } from "@/lib/ingredients";
import { LEFTOVER_BY_KEY } from "@/lib/leftovers";

// Searches are stored as ingredient keys ("chicken-breast"); show the human label.
const labelFor = (key: string): string =>
  INGREDIENT_BY_KEY[key]?.label ?? LEFTOVER_BY_KEY[key]?.label ?? key;

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — What 2 Cook" }] }),
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
          <span className="font-display text-xl font-semibold tracking-tight">What 2 Cook</span>
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

            {/* Searches (with its own keyword breakdown) beside Saved, which
                is now the card itself rather than a separate duplicate button. */}
            <section className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Search className="h-3.5 w-3.5" /> Searches
                </div>
                <p className="mt-2 font-display text-3xl">{data.searchCount.toLocaleString()}</p>

                <div className="my-4 h-px bg-border" />

                <p className="text-xs font-semibold">What you searched · last 30 days</p>
                {data.topKeywords.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Nothing yet. Searches you make while signed in will show up here.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 space-y-1.5">
                      {data.topKeywords.map((k) => (
                        <KeywordBar
                          key={k.keyword}
                          label={labelFor(k.keyword)}
                          count={k.count}
                          max={data.topKeywords[0].count}
                        />
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      From {data.searchesLast30} search{data.searchesLast30 === 1 ? "" : "es"} in
                      the last 30 days.
                    </p>
                  </>
                )}
              </div>

              <Link
                to="/saved"
                className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40 hover:bg-secondary"
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Bookmark className="h-3.5 w-3.5" /> Saved recipes
                </div>
                <p className="mt-2 font-display text-3xl">{data.savedCount.toLocaleString()}</p>

                <div className="my-4 h-px bg-border" />

                {data.recentSaved.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nothing saved yet. Tap the heart on any recipe to keep it here.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.recentSaved.map((r) => (
                      <li key={r.meal_id} className="flex items-center gap-2.5">
                        <img
                          src={r.meal_thumb}
                          alt=""
                          loading="lazy"
                          className="h-8 w-8 shrink-0 rounded-lg object-cover"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs" title={r.meal_name}>
                          {r.meal_name}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-primary">
                  View all
                  <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </section>

            {/* ZIP halved, with the portion-profile entry point beside it —
                replaces the standalone link button that lived below. */}
            {/* No items-start: both cards stretch to the taller one so they
                read as a matched pair. */}
            <section className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-lg">Your ZIP</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Surfaces trending searches near you. Stored only in this browser.
                </p>
                <div className="mt-auto flex gap-2 pt-4">
                  <input
                    value={zip}
                    onChange={(e) => setZipState(e.target.value)}
                    placeholder="e.g. 10001"
                    className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={saveZip}
                    className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:translate-y-[-1px]"
                  >
                    Save
                  </button>
                </div>
              </div>

              <Link
                to="/preferences"
                className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40 hover:bg-secondary"
              >
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-lg">Portion profile</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Who you cook for, portion sizes, and dietary preferences — applied to every
                  search.
                </p>
                {/* text-sm to match the Admin dashboard button. */}
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-primary">
                  Set up
                  <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </section>

            {data.isAdmin && (
              <section className="mt-4">
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
                >
                  <Shield className="h-3.5 w-3.5" /> Admin dashboard
                </Link>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// Deliberately a plain div bar rather than a charting library — one metric,
// eight rows, no axes. Recharts would be heavier than the thing it draws.
function KeywordBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.max(6, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-xs capitalize" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
        {count}
      </span>
    </div>
  );
}
