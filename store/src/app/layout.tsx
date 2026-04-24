import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { TenantProvider } from "@/components/TenantProvider";
import { tryGetCurrentTenant } from "@/lib/tenant";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "MP Tools Mayorista",
  description: "Catálogo mayorista de herramientas y accesorios",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tenant resuelto por proxy.ts; null en /tenant-not-found.
  const tenant = await tryGetCurrentTenant();
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jakarta.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#1a1a2e" />
      </head>
      <body className="min-h-full">
        <TenantProvider tenant={tenant}>
          <AuthProvider>
            <div className="min-h-screen bg-[#f8f9fa]">{children}</div>
            <Toaster />
          </AuthProvider>
        </TenantProvider>
        <span className="hidden md:block fixed bottom-2 right-3 text-[10px] text-gray-300 select-none pointer-events-none">
          v{process.env.NEXT_PUBLIC_APP_VERSION} · {process.env.NEXT_PUBLIC_BUILD_TIME}
        </span>
      </body>
    </html>
  );
}
