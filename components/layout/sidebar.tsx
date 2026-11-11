"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutDashboard,
  MessageSquareText,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { clearHistory, relativeTime, removeHistoryItem, useHistory } from "@/lib/agendamiento/history";

type NavItem = { label: string; icon: LucideIcon; href: string };

const NAV: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Asistente", icon: Sparkles, href: "/dashboard/asistente" },
];

interface SidebarProps {
  collapsed: boolean;
  toggleSidebar?: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, toggleSidebar, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar py-4 text-sidebar-foreground transition-[width] duration-300 ease-out",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className={cn("mb-6 flex items-center px-4", collapsed ? "justify-center px-2" : "justify-between")}>
        <Link href="/dashboard" onClick={onNavigate} className="group flex items-center gap-2.5">
          <span className="brand-badge flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105">
            <CalendarCheck className="h-5 w-5" />
          </span>
          {!collapsed && (
            <span className="leading-tight">
              <span className="block text-base font-bold">Agendamiento</span>
              <span className="block text-[11px] text-sidebar-foreground/55">Consultas y estadísticas</span>
            </span>
          )}
        </Link>
        {toggleSidebar && !collapsed && (
          <button
            onClick={toggleSidebar}
            className="rounded-full p-2 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Contraer menú"
          >
            <ChevronLeft size={18} />
          </button>
        )}
      </div>
      {toggleSidebar && collapsed && (
        <button
          onClick={toggleSidebar}
          className="mx-auto mb-2 rounded-full p-2 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="Expandir menú"
        >
          <ChevronRight size={18} />
        </button>
      )}

      <nav className={cn("space-y-1 px-3", collapsed && "px-2")}>
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "nav-link group relative flex w-full items-center rounded-lg p-2.5 text-sm font-medium transition-colors duration-200",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                collapsed && "justify-center"
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-sidebar-primary" aria-hidden />}
              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                  active ? "text-sidebar-primary" : "",
                  !collapsed && "mr-3"
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {collapsed ? (
        <Link
          href="/dashboard/asistente"
          title="Historial de preguntas"
          className="mx-auto mt-4 rounded-lg p-2.5 text-sidebar-foreground/65 transition hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <History className="h-5 w-5" />
        </Link>
      ) : (
        <Suspense fallback={null}>
          <HistoryList onNavigate={onNavigate} />
        </Suspense>
      )}
    </div>
  );
}

function HistoryList({ onNavigate }: { onNavigate?: () => void }) {
  const items = useHistory();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = pathname === "/dashboard/asistente" ? searchParams.get("h") : null;

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between px-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
          <History className="h-3.5 w-3.5" />
          Historial
        </p>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("¿Borrar todo el historial de preguntas?")) clearHistory();
            }}
            className="rounded p-1 text-sidebar-foreground/50 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Borrar historial"
            title="Borrar historial"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="sidebar-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
        {items.length === 0 ? (
          <p className="px-3 py-2 text-xs leading-relaxed text-sidebar-foreground/45">
            Aquí aparecerán las preguntas que hagas al asistente.
          </p>
        ) : (
          items.map((item, i) => {
            const active = selected === item.id;
            return (
              <div
                key={item.id}
                className="group relative animate-in fade-in slide-in-from-left-2 fill-mode-both duration-300"
                style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              >
                <Link
                  href={`/dashboard/asistente?h=${item.id}`}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-2 rounded-lg py-2 pl-2.5 pr-7 text-[13px] transition-colors duration-200",
                    active
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  )}
                >
                  {item.error ? (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-label="Con error" />
                  ) : (
                    <MessageSquareText
                      className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active ? "text-sidebar-primary" : "opacity-60")}
                    />
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 leading-snug">{item.answer?.titulo || item.pregunta}</span>
                    <span className="mt-0.5 block text-[11px] text-sidebar-foreground/40">
                      {relativeTime(item.createdAt)}
                      {item.answer ? ` · ${item.answer.result.length} filas` : ""}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => removeHistoryItem(item.id)}
                  className="absolute right-1 top-1.5 rounded p-1 text-sidebar-foreground/50 opacity-0 transition hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label="Quitar del historial"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
