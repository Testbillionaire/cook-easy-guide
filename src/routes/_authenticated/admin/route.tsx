import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, BarChart3, KeyRound, Heart, LogOut, ShieldAlert, Utensils } from "lucide-react";
import { checkAmAdmin } from "@/lib/admin.functions";
import { getOpenReportCount } from "@/lib/recipes-admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — What 2 Cook" }] }),
  component: AdminShell,
});

function AdminShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const check = useServerFn(checkAmAdmin);
  const { data, isLoading } = useQuery({
    queryKey: ["am-admin"],
    queryFn: () => check(),
  });

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data?.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <h1 className="font-display text-2xl">Admin access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your account doesn't have the admin role.</p>
          <Link to="/" className="mt-5 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Back home</Link>
        </div>
      </div>
    );
  }

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="font-display text-xl font-semibold tracking-tight">What 2 Cook · Admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/saved" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
              <Heart className="h-3.5 w-3.5" /> Saved
            </Link>
            <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 md:grid-cols-[200px_1fr]">
        <AdminNav />
        <Outlet />
      </div>
    </div>
  );
}

function AdminNav() {
  const loc = useLocation();
  const reportCountFn = useServerFn(getOpenReportCount);
  const { data: rc } = useQuery({ queryKey: ["admin-open-reports"], queryFn: () => reportCountFn(), staleTime: 30_000 });
  const items = [
    { to: "/admin", label: "Overview", icon: BarChart3, exact: true, badge: 0 },
    { to: "/admin/keywords", label: "Keywords", icon: KeyRound, exact: false, badge: 0 },
    { to: "/admin/recipes", label: "Recipes", icon: Utensils, exact: false, badge: rc?.count ?? 0 },
    { to: "/admin/users", label: "Users", icon: Users, exact: false, badge: 0 },
  ] as const;
  return (
    <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
      {items.map((it) => {
        const active = it.exact ? loc.pathname === it.to : loc.pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <it.icon className="h-4 w-4" /> {it.label}
            {it.badge > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
