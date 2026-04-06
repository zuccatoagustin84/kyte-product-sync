import { getUserRole } from "@/lib/rbac";

export async function GET() {
  const result = await getUserRole();

  if (!result) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ role: result.role });
}
