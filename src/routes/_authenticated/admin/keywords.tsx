import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getTopKeywords } from "@/lib/admin.functions";
import { RangeToggle } from "./index";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/keywords")({
  component: Keywords,
});

function Keywords() {
  const [range, setRange] = useState<"day" | "week" | "month">("week");
  const [groupBy, setGroupBy] = useState<"global" | "zip" | "country">("global");
  const fn = useServerFn(getTopKeywords);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-keywords", range, groupBy],
    queryFn: () => fn({ data: { range, groupBy } }),
  });

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Top keywords</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border bg-card p-0.5 text-xs">
            {(["global", "zip", "country"] as const).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)} className={cn("rounded-full px-3 py-1 font-medium capitalize transition", groupBy === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {g === "global" ? "All" : g === "zip" ? "By ZIP" : "By country"}
              </button>
            ))}
          </div>
          <RangeToggle range={range} setRange={setRange} />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && data.groups.length === 0 && <p className="text-sm text-muted-foreground">No searches yet.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.groups.map((g) => (
          <div key={g.label} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 font-display text-lg">{g.label}</h2>
            {g.keywords.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {g.keywords.map((k) => (
                  <li key={k.keyword} className="flex items-center justify-between py-2">
                    <span className="capitalize">{k.keyword}</span>
                    <span className="font-mono text-muted-foreground">{k.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
