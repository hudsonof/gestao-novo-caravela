import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", application: "novo-caravela", database: "ok" });
  } catch {
    return Response.json({ status: "unavailable", application: "novo-caravela", database: "unavailable" }, { status: 503 });
  }
}
