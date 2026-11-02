import { z } from "zod";
import { jsonError, ApiError } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { businessDateKey, businessDayEnd, businessDayStart } from "@/lib/dates";
import { getCashFlowReport } from "@/server/reports";

const dateSchema = z.string().date();
const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const row = (...values: unknown[]) => values.map(cell).join(";");

export async function GET(request: Request) {
  try {
    await requireManager();
    const query = new URL(request.url).searchParams;
    const today = businessDateKey(new Date());
    const fromText = dateSchema.parse(query.get("from") || today);
    const toText = dateSchema.parse(query.get("to") || today);
    const from = businessDayStart(fromText);
    const to = businessDayEnd(toText);
    if (to.getTime() < from.getTime()) throw new ApiError(400, "A data final deve ser posterior à data inicial.");
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new ApiError(400, "Selecione um período de até 12 meses.");

    const report = await getCashFlowReport(from, to, query.get("eventId") || undefined);
    const lines = [
      row("Seção", "Data", "Descrição", "Categoria", "Valor", "Detalhes"),
      row("Período", "", "Início", "", fromText, "Fim: " + toText),
      row("Resumo", "", "Entradas / vendas", "", report.totals.sales, ""),
      row("Resumo", "", "Despesas e pagamentos", "", report.totals.expenses, ""),
      row("Resumo", "", "Fluxo líquido", "", report.totals.netCashFlow, ""),
      row("Resumo", "", "Contas pendentes", "", report.totals.pendingPayables, ""),
      row("Resumo", "", "Depósitos em trânsito", "", report.totals.depositsInTransit, ""),
      row("Resumo", "", "Divergências de fechamento", "", report.totals.closingVariances, ""),
      ...report.daily.map((item) => row("Fluxo diário", item.date, "Entradas", "", item.inflows, `Saídas: ${item.outflows}; Líquido: ${item.net}`)),
      ...report.salesByMethod.map((item) => row("Vendas por meio", "", item.method, "", item.amount, "")),
      ...report.salesBySector.map((item) => row("Vendas por setor", "", item.sector, "", item.amount, "")),
      ...report.expensesByCategory.map((item) => row("Pagamentos por categoria", "", "", item.category, item.amount, "")),
      ...report.pendingPayables.map((item) => row("Pendente", item.dueDate.toISOString().slice(0, 10), item.description, item.category, item.remaining, `${item.kind}; ${item.status}`)),
      ...report.closingDifferences.map((item) => row("Fechamento", "", item.event, item.register, item.difference, `Esperado: ${item.expected}; contado: ${item.counted}`)),
    ];
    const filename = `fluxo-caixa-${fromText}-${toText}.csv`;
    return new Response(`\uFEFF${lines.join("\r\n")}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
