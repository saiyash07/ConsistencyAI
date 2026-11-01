import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, FileText, FlaskConical, GitCompare, LayoutDashboard, Menu, PlayCircle, Settings, X } from "lucide-react";
import { useState } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analyze", label: "New analysis", icon: PlayCircle },
  { to: "/compare", label: "Provider comparison", icon: GitCompare },
  { to: "/demo", label: "Demo playground", icon: FlaskConical },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <NavLink to="/" className="flex items-center gap-2 font-semibold"><BarChart3 className="h-5 w-5" aria-hidden /> Consistency AI</NavLink>
        <button className="btn-ghost" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      <aside className={`${open ? "block" : "hidden"} border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:border-b-0 lg:border-r`}>
        <NavLink to="/" className="mb-6 hidden items-center gap-2 px-1 text-lg font-semibold lg:flex"><BarChart3 className="h-5 w-5" aria-hidden /> Consistency AI</NavLink>
        <nav aria-label="Main" className="space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={link} onClick={() => setOpen(false)}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <p className="mt-8 hidden px-1 text-xs leading-relaxed text-slate-400 lg:block">
          Measures consistency between AI responses — not whether any of them is true.
        </p>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8"><Outlet /></main>
    </div>
  );
}
