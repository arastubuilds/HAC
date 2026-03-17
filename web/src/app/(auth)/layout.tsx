export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page-bg px-4 py-12">
      <div className="mb-8 text-center">
        <span className="font-display text-3xl font-bold text-primary">HAC</span>
        <p className="mt-1 text-sm text-text-secondary">Cancer Support Community</p>
      </div>
      <div
        className="animate-card-enter w-full max-w-md rounded-xl bg-surface p-8"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {children}
      </div>
    </div>
  );
}
