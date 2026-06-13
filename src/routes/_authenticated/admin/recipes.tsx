import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Download, Star, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  listManagedRecipes,
  upsertOverlay,
  bulkSetStatus,
  upsertCustomRecipe,
  deleteCustomRecipe,
  getCustomRecipe,
  importMealDbRecipe,
  listReports,
  resolveReport,
} from "@/lib/recipes-admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/recipes")({
  component: RecipesPanel,
});

type Tab = "all" | "featured" | "hidden" | "custom" | "reports";
type Row = {
  recipe_id: string;
  title: string;
  image_url: string;
  source: "mealdb" | "custom";
  status: "active" | "featured" | "hidden";
  time_band: string | null;
  dish_key: string | null;
  effort_keys: string[];
  featured_rank: number | null;
  saveCount: number;
};

const TIMES = [
  { v: "u15", l: "Under 15m" }, { v: "15_30", l: "15–30m" },
  { v: "30_60", l: "30–60m" }, { v: "60p", l: "1h+" },
] as const;
const DISHES = [
  { v: "morning", l: "Morning" }, { v: "light", l: "Light" }, { v: "main", l: "Main" },
  { v: "side", l: "Side" }, { v: "soup", l: "Soup/Stew" }, { v: "salad", l: "Salad" },
  { v: "sweet", l: "Sweet" }, { v: "drink", l: "Drink" },
] as const;
const EFFORTS = [
  { v: "one_pot", l: "1-pot" }, { v: "no_cook", l: "No-cook" },
  { v: "make_ahead", l: "Make-ahead" }, { v: "meal_prep", l: "Meal prep" },
] as const;

function RecipesPanel() {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const qc = useQueryClient();
  const list = useServerFn(listManagedRecipes);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-recipes"] });
    qc.invalidateQueries({ queryKey: ["overlays"] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-recipes", tab, search, page],
    queryFn: () => list({ data: { tab, search, page } }),
    enabled: tab !== "reports",
  });

  const bulkSet = useServerFn(bulkSetStatus);
  const bulkSetMut = useMutation({
    mutationFn: (status: "featured" | "hidden" | "active") => {
      const rows = (data?.rows ?? []).filter((r) => selected.has(r.recipe_id));
      return bulkSet({ data: { recipe_ids: rows.map((r) => r.recipe_id), sources: rows.map((r) => r.source), status } });
    },
    onSuccess: () => { setSelected(new Set()); invalidate(); },
  });

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Recipes</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
            <Download className="h-3.5 w-3.5" /> Import MealDB
          </button>
          <button onClick={() => { setEditingId(null); setCustomOpen(true); }} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> New custom
          </button>
        </div>
      </div>

      <Tabs tab={tab} setTab={(t) => { setTab(t); setPage(0); setSelected(new Set()); }} />

      {tab !== "reports" && (
        <>
          <div className="mb-3 flex items-center gap-3">
            <input
              value={search}
              onChange={(e) => { setPage(0); setSearch(e.target.value); }}
              placeholder="Search by title or ID…"
              className="w-64 rounded-full border border-border bg-card px-4 py-2 text-sm outline-none focus:border-primary"
            />
            {selected.size > 0 && (
              <div className="flex items-center gap-2 rounded-full border border-primary bg-primary/5 px-3 py-1 text-xs">
                <span className="font-semibold">{selected.size} selected</span>
                <button onClick={() => bulkSetMut.mutate("featured")} className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary hover:bg-primary/20">Feature</button>
                <button onClick={() => bulkSetMut.mutate("hidden")} className="rounded-full bg-destructive/10 px-2.5 py-1 font-semibold text-destructive hover:bg-destructive/20">Hide</button>
                <button onClick={() => bulkSetMut.mutate("active")} className="rounded-full bg-secondary px-2.5 py-1 font-semibold hover:bg-muted">Reset</button>
              </div>
            )}
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {data && (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-3"><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? new Set(data.rows.map((r) => r.recipe_id)) : new Set())} /></th>
                    <th className="px-2 py-3">Recipe</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Tags</th>
                    <th className="px-3 py-3">Saves</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.recipe_id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(r.recipe_id)} onChange={(e) => {
                          const n = new Set(selected);
                          if (e.target.checked) n.add(r.recipe_id); else n.delete(r.recipe_id);
                          setSelected(n);
                        }} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-3">
                          {r.image_url ? <img src={r.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-muted" />}
                          <div>
                            <div className="font-medium">{r.title}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{r.recipe_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.source === "custom" ? "Custom" : "MealDB"}</td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {r.time_band && <Tag>{r.time_band}</Tag>}
                          {r.dish_key && <Tag>{r.dish_key}</Tag>}
                          {r.effort_keys.map((e) => <Tag key={e}>{e}</Tag>)}
                          {!r.time_band && !r.dish_key && r.effort_keys.length === 0 && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.saveCount}</td>
                      <td className="px-3 py-2 text-xs">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => setEditingId(r.recipe_id)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold hover:bg-secondary">
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No recipes match.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {data && data.total > data.pageSize && (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>Page {page + 1} of {Math.ceil(data.total / data.pageSize)}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-border px-3 py-1 disabled:opacity-40">Prev</button>
                <button disabled={(page + 1) * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-border px-3 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "reports" && <ReportsTab onJumpToEdit={(id) => { setTab("all"); setEditingId(id); }} />}

      <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {editingId && (
            <RecipeDrawer
              row={data?.rows.find((r) => r.recipe_id === editingId) ?? {
                recipe_id: editingId, title: editingId, image_url: "", source: editingId.startsWith("cust_") || editingId.startsWith("mealdb_") ? "custom" : "mealdb",
                status: "active", time_band: null, dish_key: null, effort_keys: [], featured_rank: null, saveCount: 0,
              }}
              onClose={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); invalidate(); }}
              onEditCustom={() => { setCustomOpen(true); }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={customOpen} onOpenChange={(o) => { if (!o) { setCustomOpen(false); } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <CustomRecipeForm
            id={editingId && (editingId.startsWith("cust_") || editingId.startsWith("mealdb_")) ? editingId : null}
            onClose={() => setCustomOpen(false)}
            onSaved={() => { setCustomOpen(false); invalidate(); }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <ImportForm onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); invalidate(); }} />
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { v: Tab; l: string }[] = [
    { v: "all", l: "All" }, { v: "featured", l: "Featured" }, { v: "hidden", l: "Hidden" },
    { v: "custom", l: "Custom" }, { v: "reports", l: "Reports" },
  ];
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 text-xs">
      {items.map((it) => (
        <button key={it.v} onClick={() => setTab(it.v)} className={cn("rounded-full px-3 py-1.5 font-semibold transition", tab === it.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {it.l}
        </button>
      ))}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold">{children}</span>;
}

function StatusBadge({ status }: { status: Row["status"] }) {
  if (status === "featured") return <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary"><Star className="h-3 w-3 fill-current" />Featured</span>;
  if (status === "hidden") return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive"><EyeOff className="h-3 w-3" />Hidden</span>;
  return <span className="text-muted-foreground">Active</span>;
}

function RecipeDrawer({ row, onClose, onSaved, onEditCustom }: { row: Row; onClose: () => void; onSaved: () => void; onEditCustom: () => void }) {
  const [status, setStatus] = useState(row.status);
  const [timeBand, setTimeBand] = useState(row.time_band ?? "");
  const [dishKey, setDishKey] = useState(row.dish_key ?? "");
  const [efforts, setEfforts] = useState<string[]>(row.effort_keys);
  const upsert = useServerFn(upsertOverlay);
  const del = useServerFn(deleteCustomRecipe);
  const saveMut = useMutation({
    mutationFn: () => upsert({ data: {
      recipe_id: row.recipe_id, source: row.source, status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      time_band: (timeBand || null) as any, dish_key: (dishKey || null) as any, effort_keys: efforts as any,
    } }),
    onSuccess: onSaved,
  });
  const delMut = useMutation({ mutationFn: () => del({ data: { id: row.recipe_id } }), onSuccess: onSaved });

  return (
    <div className="p-6">
      <h2 className="font-display text-2xl">{row.title}</h2>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{row.recipe_id} · {row.source}</p>

      <div className="mt-5">
        <Label>Status</Label>
        <div className="mt-1 flex gap-2">
          {(["active", "featured", "hidden"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", status === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary")}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Label>Time band</Label>
        <ChipRow items={TIMES} value={timeBand} onChange={setTimeBand} />
      </div>
      <div className="mt-4">
        <Label>Dish type</Label>
        <ChipRow items={DISHES} value={dishKey} onChange={setDishKey} />
      </div>
      <div className="mt-4">
        <Label>Effort (multi)</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {EFFORTS.map((e) => {
            const on = efforts.includes(e.v);
            return (
              <button key={e.v} onClick={() => setEfforts(on ? efforts.filter((x) => x !== e.v) : [...efforts, e.v])} className={cn("rounded-full px-3 py-1 text-xs font-semibold", on ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary")}>
                {e.l}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
          {row.source === "custom" && (
            <>
              <button onClick={onEditCustom} className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"><Pencil className="h-3.5 w-3.5" /> Edit content</button>
              <button onClick={() => { if (confirm("Delete this custom recipe?")) delMut.mutate(); }} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
            </>
          )}
        </div>
        <button disabled={saveMut.isPending} onClick={() => saveMut.mutate()} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</label>;
}
function ChipRow({ items, value, onChange }: { items: readonly { v: string; l: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      <button onClick={() => onChange("")} className={cn("rounded-full px-3 py-1 text-xs font-semibold", value === "" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary")}>Any</button>
      {items.map((it) => (
        <button key={it.v} onClick={() => onChange(it.v)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", value === it.v ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary")}>{it.l}</button>
      ))}
    </div>
  );
}

function CustomRecipeForm({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
  const get = useServerFn(getCustomRecipe);
  const { data: existing } = useQuery({ queryKey: ["custom-recipe", id], queryFn: () => id ? get({ data: { id } }) : null, enabled: !!id });
  const [title, setTitle] = useState("");
  const [image, setImage] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");
  const [instructions, setInstructions] = useState("");
  const [ings, setIngs] = useState<{ name: string; measure: string }[]>([{ name: "", measure: "" }]);
  const [loaded, setLoaded] = useState(false);

  if (existing && !loaded) {
    setTitle(existing.title); setImage(existing.image_url); setCategory(existing.category);
    setArea(existing.area); setInstructions(existing.instructions);
    setIngs(Array.isArray(existing.ingredients) && existing.ingredients.length ? existing.ingredients as { name: string; measure: string }[] : [{ name: "", measure: "" }]);
    setLoaded(true);
  }

  const upsert = useServerFn(upsertCustomRecipe);
  const mut = useMutation({
    mutationFn: () => upsert({ data: {
      id: id ?? undefined, title, image_url: image, category, area, instructions,
      ingredients: ings.filter((i) => i.name.trim()),
    } }),
    onSuccess: onSaved,
  });

  return (
    <div className="p-6">
      <h2 className="font-display text-2xl">{id ? "Edit recipe" : "New custom recipe"}</h2>
      <div className="mt-4 grid gap-3">
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" /></Field>
        <Field label="Image URL"><input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" /></Field>
          <Field label="Area"><input value={area} onChange={(e) => setArea(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" /></Field>
        </div>
        <Field label="Ingredients">
          <div className="space-y-1.5">
            {ings.map((row, i) => (
              <div key={i} className="flex gap-2">
                <input value={row.name} onChange={(e) => { const n = [...ings]; n[i] = { ...n[i], name: e.target.value }; setIngs(n); }} placeholder="Name" className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
                <input value={row.measure} onChange={(e) => { const n = [...ings]; n[i] = { ...n[i], measure: e.target.value }; setIngs(n); }} placeholder="Measure" className="w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
                <button onClick={() => setIngs(ings.filter((_, j) => j !== i))} className="rounded-lg border border-border px-2 text-xs">×</button>
              </div>
            ))}
            <button onClick={() => setIngs([...ings, { name: "", measure: "" }])} className="text-xs font-semibold text-primary hover:underline">+ Add ingredient</button>
          </div>
        </Field>
        <Field label="Instructions"><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
        <button disabled={!title.trim() || mut.isPending} onClick={() => mut.mutate()} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><Label>{label}</Label>{children}</div>;
}

function ImportForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [id, setId] = useState("");
  const imp = useServerFn(importMealDbRecipe);
  const mut = useMutation({ mutationFn: () => imp({ data: { mealdb_id: id } }), onSuccess: onDone });
  return (
    <div className="p-6">
      <h2 className="font-display text-2xl">Import from MealDB</h2>
      <p className="mt-1 text-xs text-muted-foreground">Enter a MealDB recipe ID (e.g. 52772). It will be copied into your DB and become editable.</p>
      <input value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} placeholder="52772" className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      {mut.error && <p className="mt-2 text-xs text-destructive">{(mut.error as Error).message}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
        <button disabled={!id || mut.isPending} onClick={() => mut.mutate()} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Import
        </button>
      </div>
    </div>
  );
}

function ReportsTab({ onJumpToEdit }: { onJumpToEdit: (id: string) => void }) {
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed" | "all">("open");
  const qc = useQueryClient();
  const list = useServerFn(listReports);
  const resolve = useServerFn(resolveReport);
  const { data, isLoading } = useQuery({ queryKey: ["admin-reports", status], queryFn: () => list({ data: { status } }) });
  const mut = useMutation({
    mutationFn: (v: { id: string; action: "resolve" | "dismiss" | "hide_recipe" }) => resolve({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-reports"] }); qc.invalidateQueries({ queryKey: ["admin-open-reports"] }); qc.invalidateQueries({ queryKey: ["overlays"] }); },
  });
  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-full border border-border bg-card p-1 text-xs">
        {(["open", "resolved", "dismissed", "all"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full px-3 py-1 font-semibold", status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{s}</button>
        ))}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground">No reports.</p>}
      <ul className="space-y-2">
        {(data ?? []).map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{r.recipe_name || r.recipe_id}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{r.recipe_id}</div>
              </div>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase">{r.reason.replace("_", " ")}</span>
            </div>
            {r.note && <p className="mt-1 text-xs text-muted-foreground">"{r.note}"</p>}
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{new Date(r.created_at).toLocaleString()} · status: {r.status}</span>
              {r.status === "open" && (
                <div className="flex gap-1.5">
                  <button onClick={() => onJumpToEdit(r.recipe_id)} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold hover:bg-muted">Open in editor</button>
                  <button onClick={() => mut.mutate({ id: r.id, action: "hide_recipe" })} className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/20">Hide recipe</button>
                  <button onClick={() => mut.mutate({ id: r.id, action: "resolve" })} className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20">Resolve</button>
                  <button onClick={() => mut.mutate({ id: r.id, action: "dismiss" })} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold hover:bg-secondary">Dismiss</button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

void RotateCcw;
