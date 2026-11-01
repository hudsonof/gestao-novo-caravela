import { z } from "zod";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { businessDateKey, businessDayEnd, businessDayStart } from "@/lib/dates";
import { getCashFlowReport } from "@/server/reports";

const dateSchema = z.string().date();

export async function GET(request: Request) {
  return handleApi(async () => {
    await requireManager();
    const query = new URL(request.url).searchParams;
    const today = businessDateKey(new Date());
    const fromText = dateSchema.parse(query.get("from") || today);
    const toText = dateSchema.parse(query.get("to") || today);
    const from = businessDayStart(fromText);
    const to = businessDayEnd(toText);
    if (to.getTime() < from.getTime()) throw new ApiError(400, "A data final deve ser posterior à data inicial.");
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new ApiError(400, "Selecione um período de até 12 meses.");
    return getCashFlowReport(from, to, query.get("eventId") || undefined);
  });
}
