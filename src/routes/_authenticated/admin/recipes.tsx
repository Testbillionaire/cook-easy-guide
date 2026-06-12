import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getTopRecipes } from "@/lib/admin.functions";
import { RangeToggle } from "./index";

export const Route = createFileRoute("/_authenticated/admin/recipes")({
  component: TopRecipes,
});

function TopRecipes() {
  const [range, setRange] = useState<"day" | "week" | "month">("week");
  const fn = useServerFn(getTopRecipes);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-top-recipes", range],
    queryFn: () => fn({ data: { range } }),
  });
  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl">Top saved recipes</h1>
        <RangeToggle range={range} setRange={setRange} />
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground">No saves yet.</p>}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {data?.map((r, i) => (
          <li key={r.meal_id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="w-6 font-mono text-muted-foreground">{i + 1}</span>
            <span className="flex-1 font-medium">{r.meal_name}</span>
            <span className="font-mono text-muted-foreground">{r.count} saves</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
