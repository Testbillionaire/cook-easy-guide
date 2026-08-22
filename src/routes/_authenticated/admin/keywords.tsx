import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getTopKeywords } from "@/lib/admin.functions";
import { INGREDIENT_BY_KEY } from "@/lib/ingredients";
import { RangeToggle } from "./index";
import { cn } from "@/lib/utils";
import { countryLabel, regionLabel } from "@/lib/geo-labels";

const labelFor = (key: string) => INGREDIENT_BY_KEY[key]?.label ?? key;

export const Route = createFileRoute("/_authenticated/admin/keywords")({
  component: Keywords,
});

function Keywords() {
  const [range, setRange] = useState<"day" | "week" | "month">("week");
  const [groupBy, setGroupBy] = useState<"global" | "zip" | "region" | "country">("global");
  const fn = useServerFn(getTopKeywords);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-keywords", range, groupBy],
    queryFn: () => fn({ data: { range, groupBy } }),
  });

  // Region groups arrive as "US-NY" (country-qualified); show "New York (US)".
  const groupHeading = (label: string) => {
    if (groupBy === "country") return countryLabel(label) ?? label;
    if (groupBy === "region") {
      if (label === "Unknown") return "Unknown";
      const [cc, ...rest] = label.split("-");
      const rc = rest.join("-");
      const name = regionLabel(cc, rc) ?? rc;
      return `${name} (${cc})`;
    }
    return label;
  };

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Top keywords</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border bg-card p-0.5 text-xs">
            {(["global", "region", "country", "zip"] as const).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)} className={cn("rounded-full px-3 py-1 font-medium transition", groupBy === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {g === "global" ? "All" : g === "region" ? "By state" : g === "country" ? "By country" : "By ZIP"}
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
            <h2 className="mb-3 font-display text-lg">{groupHeading(g.label)}</h2>
            {g.keywords.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {g.keywords.map((k) => (
                  <li key={k.keyword} className="flex items-center justify-between py-2">
                    <span className="capitalize">{labelFor(k.keyword)}</span>
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
