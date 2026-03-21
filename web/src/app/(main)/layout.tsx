import { Navbar } from "@/components/layout/Navbar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page-bg">
      <Navbar />
      <main className="mx-auto max-w-[1200px] px-6 py-8 min-h-[calc(100vh-4rem)]">{children}</main>
    </div>
  );
}
