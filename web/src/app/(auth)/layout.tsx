export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page-bg px-4 py-8 sm:py-12">
      <div className="mb-8 text-center">
        <span className="font-display text-3xl font-bold text-primary">HAC</span>
        <p className="mt-1 text-sm text-text-secondary">Cancer Support Community</p>
      </div>
      <div
        className="animate-card-enter relative overflow-hidden w-full max-w-md rounded-xl bg-surface p-6 sm:p-8"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        {children}
      </div>
    </div>
  );
}
