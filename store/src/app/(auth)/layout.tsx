export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{
        background: "linear-gradient(135deg, var(--navy) 0%, #16213e 60%, #0f3460 100%)",
      }}
    >
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-1 select-none">
        <span
          className="text-3xl font-extrabold tracking-wide"
          style={{ color: "var(--brand)" }}
        >
          MP TOOLS
        </span>
        <span className="text-sm text-white/60 font-medium tracking-widest uppercase">
          Mayorista
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        {children}
      </div>
    </div>
  );
}
