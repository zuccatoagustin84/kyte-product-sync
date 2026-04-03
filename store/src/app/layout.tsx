import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";
import { AuthProvider } from "@/components/auth/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MP Tools Mayorista",
  description: "Catálogo mayorista de herramientas y accesorios",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#1a1a2e" />
      </head>
      <body className="min-h-full">
        <AuthProvider>
          <div className="min-h-screen bg-[#f8f9fa]">{children}</div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
