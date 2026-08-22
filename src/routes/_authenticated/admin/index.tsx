import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { getTrafficStats, listEmailInterest, listDietRequests } from "@/lib/admin.functions";
import { countryLabel } from "@/lib/geo-labels";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Overview,
});

type Range = "day" | "week" | "month";

function Overview() {
  const [range, setRange] = useState<Range>("week");
  const fn = useServerFn(getTrafficStats);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-traffic", range],
    queryFn: () => fn({ data: { range } }),
  });

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl">Traffic overview</h1>
        <RangeToggle range={range} setRange={setRange} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Total searches" value={data.totalSearches.toLocaleString()} />
            <Kpi label="Unique signed-in users" value={data.uniqueUsers.toLocaleString()} />
            <Kpi label="Top country" value={countryLabel(data.topCountries[0]?.country) ?? "—"} sub={data.topCountries[0]?.count ? `${data.topCountries[0].count} searches` : undefined} />
            <Kpi
              label="Want email sign-in"
              value={data.emailInterestPeople.toLocaleString()}
              sub={`${data.emailInterestAttempts.toLocaleString()} attempts · all time`}
            />
          </div>

          <Panel title="Searches over time">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Panel title="Top ZIP codes">
              {data.topZips.length === 0 ? <Empty /> : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.topZips}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="zip" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel title="Top countries">
              {data.topCountries.length === 0 ? <Empty /> : (
                <ul className="divide-y divide-border text-sm">
                  {data.topCountries.map((c) => (
                    <li key={c.country} className="flex items-center justify-between py-2">
                      <span>{countryLabel(c.country) ?? c.country}</span>
                      <span className="font-mono text-muted-foreground">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="mt-6">
            <EmailInterestPanel />
          </div>

          <div className="mt-6">
            <DietRequestsPanel />
          </div>
        </>
      )}
    </section>
  );
}

function EmailInterestPanel() {
  const fn = useServerFn(listEmailInterest);
  const [copied, setCopied] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-email-interest"],
    queryFn: () => fn(),
    retry: false,
  });

  const rows = data ?? [];
  // Distinguish "nobody asked yet" from "the table was never created" — the
  // migration is applied by hand, so a missing table is a real possibility.
  const missingTable = !!error && /email_interest|PGRST205|schema cache/i.test(String(error));

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(rows.map((r) => r.email).join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — nothing to do.
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg">Waiting for email sign-in</h2>
        {rows.length > 0 && (
          <button
            onClick={copyAll}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition hover:bg-primary hover:text-primary-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy all"}
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        People who tried to sign in with an email address while email sign-in is disabled.
        They were told we'd notify them — this is that list.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {missingTable ? (
            <>
              <p className="font-medium">The <code>email_interest</code> table doesn't exist yet.</p>
              <p className="mt-1 text-muted-foreground">
                Sign-in attempts are <strong>not</strong> being recorded. Run{" "}
                <code>supabase/migrations/20260820120000_email_interest.sql</code> in the
                Supabase SQL Editor to start collecting them.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Couldn't load the list: {String(error)}</p>
          )}
        </div>
      )}
      {!isLoading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No one has asked for email sign-in yet.
        </p>
      )}
      {rows.length > 0 && (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="pb-2 font-semibold">Email</th>
                <th className="pb-2 text-right font-semibold">Tries</th>
                <th className="pb-2 text-right font-semibold">Last try</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.email}>
                  <td className="py-2 pr-3 break-all">{r.email}</td>
                  <td className="py-2 text-right font-mono text-muted-foreground">{r.attempts}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">
                    {r.last_attempt_at?.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DietRequestsPanel() {
  const fn = useServerFn(listDietRequests);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-diet-requests"],
    queryFn: () => fn(),
    retry: false,
  });

  const rows = data ?? [];
  // Same guard as the email-interest panel: the migration is applied by hand,
  // so a missing table is a real possibility and shouldn't look like "no data".
  const missingTable = !!error && /diet_requests|PGRST205|schema cache/i.test(String(error));

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-1 font-display text-lg">Requested dietary restrictions</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        What people need that we don't filter on yet — both listed-but-unbuilt options they
        ticked and restrictions they typed in themselves. Counts are distinct people, so this
        ranks what to build next.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {missingTable ? (
            <>
              <p className="font-medium">The <code>diet_requests</code> table doesn't exist yet.</p>
              <p className="mt-1 text-muted-foreground">
                Requests are <strong>not</strong> being recorded. Run{" "}
                <code>supabase/migrations/20260821090000_diet_requests.sql</code> in the
                Supabase SQL Editor to start collecting them.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Couldn't load the list: {String(error)}</p>
          )}
        </div>
      )}
      {!isLoading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No custom restrictions requested yet.</p>
      )}
      {rows.length > 0 && (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="pb-2 font-semibold">Restriction</th>
                <th className="pb-2 font-semibold">Source</th>
                <th className="pb-2 text-right font-semibold">People</th>
                <th className="pb-2 text-right font-semibold">Last asked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-2 pr-3 break-all">{r.label}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        r.source === "custom"
                          ? "bg-accent/10 text-accent"
                          : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {r.source === "custom" ? "Typed in" : "From list"}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono text-muted-foreground">{r.count}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">
                    {r.lastRequestedAt?.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 font-display text-lg">{title}</h2>
      {children}
    </div>
  );
}
function Empty() { return <p className="text-sm text-muted-foreground">No data yet.</p>; }

export function RangeToggle({ range, setRange }: { range: Range; setRange: (r: Range) => void }) {
  return (
    <div className="flex rounded-full border border-border bg-card p-0.5 text-xs">
      {(["day", "week", "month"] as const).map((r) => (
        <button key={r} onClick={() => setRange(r)} className={cn("rounded-full px-3 py-1 font-medium transition", range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {r === "day" ? "24h" : r === "week" ? "7d" : "30d"}
        </button>
      ))}
    </div>
  );
}
