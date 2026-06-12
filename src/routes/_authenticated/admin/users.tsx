import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listUsers, getUserActivity, setAdminRole, setUserDisabled, deleteUser } from "@/lib/admin.functions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Shield, ShieldOff, Ban, CheckCircle, Trash2, Eye, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

function UsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const role = useServerFn(setAdminRole);
  const disable = useServerFn(setUserDisabled);
  const del = useServerFn(deleteUser);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search, page],
    queryFn: () => list({ data: { search, page } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });
  const roleMut = useMutation({ mutationFn: (v: { userId: string; action: "grant" | "revoke" }) => role({ data: v }), onSuccess: invalidate });
  const disableMut = useMutation({ mutationFn: (v: { userId: string; disabled: boolean }) => disable({ data: v }), onSuccess: invalidate });
  const delMut = useMutation({ mutationFn: (userId: string) => del({ data: { userId } }), onSuccess: invalidate });

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Users</h1>
        <input
          value={search}
          onChange={(e) => { setPage(0); setSearch(e.target.value); }}
          placeholder="Search by email…"
          className="w-64 rounded-full border border-border bg-card px-4 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-3 py-3">Joined</th>
                <th className="px-3 py-3">Last seen</th>
                <th className="px-3 py-3">Searches</th>
                <th className="px-3 py-3">Saved</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.email ?? "—"}</div>
                    {u.isAdmin && <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"><Shield className="h-3 w-3" />ADMIN</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-3 font-mono text-xs">{u.searchCount}</td>
                  <td className="px-3 py-3 font-mono text-xs">{u.saveCount}</td>
                  <td className="px-3 py-3 text-xs">{u.disabled ? <span className="text-destructive">Disabled</span> : <span className="text-muted-foreground">Active</span>}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="View activity" onClick={() => setOpenId(u.id)}><Eye className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn
                        title={u.isAdmin ? "Revoke admin" : "Grant admin"}
                        onClick={() => roleMut.mutate({ userId: u.id, action: u.isAdmin ? "revoke" : "grant" })}
                      >
                        {u.isAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                      </IconBtn>
                      <IconBtn
                        title={u.disabled ? "Re-enable" : "Disable"}
                        onClick={() => disableMut.mutate({ userId: u.id, disabled: !u.disabled })}
                      >
                        {u.disabled ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                      </IconBtn>
                      <IconBtn
                        title="Delete user"
                        onClick={() => { if (confirm(`Delete ${u.email}? This cannot be undone.`)) delMut.mutate(u.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
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

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {openId && <ActivityView userId={openId} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-background hover:bg-secondary">{children}</button>;
}

function ActivityView({ userId }: { userId: string }) {
  const fn = useServerFn(getUserActivity);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-activity", userId],
    queryFn: () => fn({ data: { userId } }),
  });
  if (isLoading) return <div className="grid h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!data) return null;
  return (
    <div className="p-6">
      <h2 className="mb-4 font-display text-xl">User activity</h2>
      <h3 className="mb-2 text-sm font-semibold">Recent searches ({data.searches.length})</h3>
      <ul className="mb-6 space-y-2 text-xs">
        {data.searches.map((s, i) => (
          <li key={i} className="rounded-lg border border-border bg-card p-2">
            <div className="flex justify-between"><span className="font-medium">{(s.ingredients as string[]).join(", ") || "—"}</span><span className="text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span></div>
            <div className="mt-1 text-muted-foreground">{[s.time_band, s.dish_key, s.effort_key].filter(Boolean).join(" · ")} · {s.result_count} results{s.zip_code ? ` · ${s.zip_code}` : ""}</div>
          </li>
        ))}
      </ul>
      <h3 className="mb-2 text-sm font-semibold">Saved recipes ({data.saves.length})</h3>
      <ul className="space-y-2 text-xs">
        {data.saves.map((s) => (
          <li key={s.meal_id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
            <img src={s.meal_thumb} alt="" className="h-10 w-10 rounded-md object-cover" />
            <span className="flex-1 font-medium">{s.meal_name}</span>
            <span className="text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
