import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.financialAccount.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  });
}
