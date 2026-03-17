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
    [
      "text-sm font-medium transition-colors duration-[var(--duration-base)]",
      active
        ? "text-primary border-b-2 border-primary pb-0.5"
        : "text-nav-text hover:text-primary",
    ].join(" ");

  return (
    <header className="h-16 bg-nav-bg flex items-center px-6 sticky top-0 z-50">
      <div className="mx-auto max-w-[1200px] w-full flex items-center justify-between">
        {/* Brand */}
        <Link href="/forum" className="flex items-center gap-2">
          <span className="font-display text-xl font-bold text-primary">HAC</span>
          <span className="text-sm text-nav-text">Community</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-6">
          <Link href="/forum" className={navLinkClass(pathname.startsWith("/forum"))}>
            Forum
          </Link>
          <Link href="/chat" className={navLinkClass(pathname === "/chat")}>
            Chat
          </Link>
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Avatar userId={user.id} size="sm" />
              <span className="text-sm text-nav-text">{user.username}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-nav-text hover:text-primary transition-colors duration-[var(--duration-base)]"
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
                className="text-sm font-semibold bg-primary text-white px-3 py-1.5 rounded-sm hover:bg-primary-hover transition-colors duration-[var(--duration-base)]"
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
