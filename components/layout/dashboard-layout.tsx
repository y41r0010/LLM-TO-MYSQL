"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <div className="app-bg relative min-h-screen">
      <div
        className={`fixed inset-y-0 z-50 hidden flex-col border-r border-sidebar-border bg-sidebar shadow-xl transition-[width] duration-300 ease-out md:flex ${sidebarCollapsed ? "w-20" : "w-64"}`}
      >
        <Sidebar collapsed={sidebarCollapsed} toggleSidebar={() => setSidebarCollapsed((c) => !c)} />
      </div>

      {/* Phones: the same menu in a slide-over panel. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 border-none bg-sidebar p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className={`pb-10 transition-all duration-300 ${sidebarCollapsed ? "md:pl-20" : "md:pl-64"}`}>
        <Header toggleSidebar={() => setMobileOpen(true)} />
        <main className="min-w-0 p-4 md:p-6">
          {/* Fade the page in on every route change. */}
          <div key={pathname} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
