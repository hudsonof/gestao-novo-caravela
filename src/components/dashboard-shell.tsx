"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/actions";

type IconName = "cash" | "team" | "collapse" | "expand" | "menu" | "close" | "logout";

function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {name === "cash" && <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M7 14h.01M11 14h3" /></>}
      {name === "team" && <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.2a3 3 0 0 1 0 5.6M18 14a5 5 0 0 1 3 4.6V20" /></>}
      {name === "collapse" && <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 9l-2 3 2 3" /></>}
      {name === "expand" && <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M14 9l2 3-2 3" /></>}
      {name === "menu" && <><path d="M4 7h16M4 12h16M4 17h16" /></>}
      {name === "close" && <><path d="m6 6 12 12M18 6 6 18" /></>}
      {name === "logout" && <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>}
    </svg>
  );
}

const links = [
  { href: "/caixas", label: "Controle de caixas", shortLabel: "Caixas", icon: "cash" as const },
  { href: "/equipe", label: "Colaboradores", shortLabel: "Equipe", icon: "team" as const },
];

export function DashboardShell({
  children,
  userName,
  role,
}: {
  children: React.ReactNode;
  userName: string | null;
  role: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = userName?.trim() || "Usuário";
  const initials = displayName.split(/\\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const roleLabel = role === "ADMIN" ? "Administrador" : "Gerente";

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  return (
    <div className={"layout" + (collapsed ? " sidebar-is-collapsed" : "") + (mobileOpen ? " mobile-menu-open" : "")}>
      <a className="skip-to-content" href="#main-content">Pular para o conteúdo</a>
      <button
        className="sidebar-mobile-trigger"
        type="button"
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        aria-controls="primary-navigation"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
      >
        <Icon name={mobileOpen ? "close" : "menu"} />
      </button>
      {mobileOpen && <button className="sidebar-backdrop" type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}

      <aside className="sidebar" aria-label="Navegação principal">
        <div className="sidebar-brand-row">
          <Link href="/caixas" className="brand" aria-label="Novo Caravela, início">
            <span className="brand-mark" aria-hidden="true">NC</span>
            <span className="brand-copy">NOVO CARAVELA<small>Gestão financeira</small></span>
          </Link>
          <button
            className="sidebar-collapse-toggle"
            type="button"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Icon name={collapsed ? "expand" : "collapse"} />
          </button>
        </div>

        <nav id="primary-navigation" className="nav" aria-label="Menu principal">
          {links.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="navlink"
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <Icon name={item.icon} />
                <span className="nav-label"><span>{item.shortLabel}</span><small>{item.label}</small></span>
              </Link>
            );
          })}
        </nav>

        <footer className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-avatar" aria-hidden="true">{initials}</span>
            <span className="sidebar-profile-copy"><strong title={displayName}>{displayName}</strong><small>{roleLabel}</small></span>
          </div>
          <form action={logout}>
            <button className="sidebar-logout" type="submit" title={collapsed ? "Sair" : undefined}>
              <Icon name="logout" />
              <span className="logout-label">Sair</span>
            </button>
          </form>
        </footer>
      </aside>

      <main id="main-content" className="main">{children}</main>
    </div>
  );
}
