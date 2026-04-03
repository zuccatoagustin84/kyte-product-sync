export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* LEFT PANEL — navy branding, hidden on mobile */}
      <div
        className="hidden lg:flex lg:w-2/5 flex-col justify-between px-12 py-12 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #0d1117 100%)" }}
      >
        {/* Decorative grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 40px)",
          }}
        />

        {/* Decorative glow blob */}
        <div
          className="absolute top-[-80px] right-[-80px] w-64 h-64 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(234,88,12,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Top: Logo + badge */}
        <div className="relative z-10 flex items-center gap-3 select-none">
          <span
            className="text-3xl font-black tracking-wide"
            style={{ color: "var(--brand, #ea580c)" }}
          >
            MP TOOLS
          </span>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest"
            style={{
              background: "rgba(234,88,12,0.15)",
              color: "var(--brand, #ea580c)",
              border: "1px solid rgba(234,88,12,0.3)",
            }}
          >
            Mayorista
          </span>
        </div>

        {/* Middle: Tagline */}
        <div className="relative z-10 flex flex-col gap-4">
          <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
            Tu plataforma<br />
            <span style={{ color: "var(--brand, #ea580c)" }}>mayorista</span>
          </h2>
          <p className="text-base text-white/50 leading-relaxed max-w-xs">
            Accedé al catálogo completo, armá pedidos y gestioná tu cuenta desde un solo lugar.
          </p>
        </div>

        {/* Bottom: Stats */}
        <div className="relative z-10 flex flex-col gap-3">
          {[
            { value: "1.200+", label: "Productos disponibles" },
            { value: "16", label: "Categorías" },
            { value: "Online", label: "Pedidos en línea" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-4 px-4 py-3 rounded-xl"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span
                className="text-xl font-black tabular-nums"
                style={{ color: "var(--brand, #ea580c)" }}
              >
                {stat.value}
              </span>
              <span className="text-sm text-white/60">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL — white form area */}
      <div className="flex-1 bg-white overflow-y-auto">
        <div className="min-h-full flex flex-col">
          {/* Mobile logo — only visible on small screens */}
          <div className="lg:hidden flex items-center gap-2.5 px-6 pt-8 pb-2 select-none">
            <span
              className="text-2xl font-black tracking-wide"
              style={{ color: "var(--brand, #ea580c)" }}
            >
              MP TOOLS
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{
                background: "rgba(234,88,12,0.1)",
                color: "var(--brand, #ea580c)",
                border: "1px solid rgba(234,88,12,0.25)",
              }}
            >
              Mayorista
            </span>
          </div>

          {/* Centered form content */}
          <div className="flex-1 flex items-center justify-center px-6 py-12">
            <div className="w-full max-w-sm">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
