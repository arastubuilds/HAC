"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { Avatar } from "@/components/ui/Avatar";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearUser();
    router.push("/login");
  }

  const navLinkClass = (active: boolean) =>
    active
      ? "bg-primary/[0.12] text-primary rounded-full px-3 py-1 text-sm font-medium transition-colors duration-[var(--duration-base)]"
      : "text-nav-text/70 hover:text-nav-text hover:bg-white/[0.05] rounded-full px-3 py-1 text-sm font-medium transition-colors duration-[var(--duration-base)]";

  return (
    <header className="h-16 bg-nav-bg/[0.97] backdrop-blur-md border-b border-white/[0.06] flex items-center px-6 sticky top-0 z-50">
      <div className="mx-auto max-w-[1200px] w-full flex items-center justify-between">
        {/* Brand */}
        <Link href="/forum" className="flex items-center gap-2">
          <span className="font-display text-xl font-bold text-primary">HAC</span>
          <span className="hidden sm:inline text-xs font-medium text-nav-text/50 tracking-wider uppercase">Community</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          <Link href="/forum" className={navLinkClass(pathname.startsWith("/forum"))}>
            Forum
          </Link>
          <Link href="/chat" className={navLinkClass(pathname === "/chat")}>
            Chat
          </Link>
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-3">
          <div className="w-px h-4 bg-nav-text/20 mx-1" />
          {user ? (
            <>
              <Avatar userId={user.id} size="sm" />
              <span className="hidden sm:inline text-sm text-nav-text">{user.username}</span>
              <span className="text-nav-text/25 text-xs mx-0.5">|</span>
              <button
                onClick={handleLogout}
                className="text-xs text-nav-text/50 hover:text-primary transition-colors duration-[var(--duration-base)]"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-nav-text hover:text-primary transition-colors duration-[var(--duration-base)]"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="text-sm font-semibold bg-primary text-white px-4 py-1.5 rounded-full hover:bg-primary-hover transition-colors duration-[var(--duration-base)]"
              >
                Join
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
