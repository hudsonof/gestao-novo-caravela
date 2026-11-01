import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const eventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  startsAt: z.coerce.date(),
  endsAt: z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.date().optional()),
  notes: z.string().trim().max(2000).optional(),
});

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.event.findMany({ orderBy: { startsAt: "desc" }, take: 200 });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const input = eventSchema.parse(await request.json());
    if (input.endsAt && input.endsAt < input.startsAt) throw new ApiError(400, "A data final deve ser posterior à inicial.");
    return prisma.$transaction(async (tx) => {
      const event = await tx.event.create({ data: input });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "Event", entityId: event.id, action: "CREATE", after: { name: event.name, startsAt: event.startsAt.toISOString() } } });
      return event;
    });
  }, 201);
}
