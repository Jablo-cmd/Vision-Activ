import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABEL } from "../domain";
import { navFor } from "./nav";
import { NotificationBell } from "./NotificationBell";
import { useProfileName } from "../hooks/useProfileName";

function Brand() {
  return (
    <div className="border-b border-line px-5 py-5">
      <div className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-brand-700">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand-600" />
        VISION ACTIV
      </div>
      <div className="mt-1 text-sm font-medium leading-tight text-ink-500">
        High-Performance Operating Framework
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useAuth();
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto p-3">
      {navFor(role).map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium " +
                    (isActive
                      ? "bg-brand-50 font-semibold text-brand-800 shadow-[inset_3px_0_0_var(--color-brand-600)]"
                      : "text-ink-700 hover:bg-brand-50/70")
                  }
                >
                  <item.icon size={18} aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const name = useProfileName(user?.id);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold text-brand-800 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>

      <aside
        className="no-print hidden w-64 shrink-0 flex-col border-r border-line bg-white lg:flex"
        aria-label="Sidebar"
      >
        <div className="sticky top-0 flex h-screen flex-col">
          <Brand />
          <NavList />
          <p className="border-t border-line px-5 py-3 text-xs text-ink-500">
            Signed in as {role ? ROLE_LABEL[role] : ""}
          </p>
        </div>
      </aside>

      {open && (
        <div
          className="no-print fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            aria-label="Close navigation"
            tabIndex={-1}
            className="absolute inset-0 bg-brand-900/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex justify-end p-2">
              <button
                ref={closeRef}
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-ink-700 hover:bg-brand-50"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <Brand />
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur md:px-8">
          <button
            ref={menuRef}
            type="button"
            aria-label="Open navigation"
            className="rounded-lg p-2 text-ink-700 hover:bg-brand-50 lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <NotificationBell />
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold text-ink-900">{name ?? user?.email}</p>
              <p className="text-xs text-ink-500">{role ? ROLE_LABEL[role] : ""}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50"
            >
              <LogOut size={18} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">
          {children}
        </main>
        <footer className="no-print border-t border-line px-4 py-4 text-xs text-ink-500 md:px-8">
          Vision Activ · High-Performance Operating Framework
        </footer>
      </div>
    </div>
  );
}
