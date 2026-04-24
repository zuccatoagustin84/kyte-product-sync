import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/rbac-server";
import { SuperadminSidebar } from "@/components/superadmin/SuperadminSidebar";

export const metadata = {
  title: "Tutienda Backoffice",
};

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: el proxy ya gatea, pero validamos también acá
  // por si alguna ruta escapa del matcher.
  const result = await getUserRole();
  if (!result || result.role !== "superadmin") {
    redirect("/");
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <SuperadminSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
