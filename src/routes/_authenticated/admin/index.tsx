import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getTrafficStats } from "@/lib/admin.functions";
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
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Kpi label="Total searches" value={data.totalSearches.toLocaleString()} />
            <Kpi label="Unique signed-in users" value={data.uniqueUsers.toLocaleString()} />
            <Kpi label="Top country" value={data.topCountries[0]?.country ?? "—"} sub={data.topCountries[0]?.count ? `${data.topCountries[0].count} searches` : undefined} />
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
                      <span>{c.country}</span>
                      <span className="font-mono text-muted-foreground">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </section>
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
