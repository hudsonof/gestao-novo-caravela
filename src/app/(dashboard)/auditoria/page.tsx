import { prisma } from "@/lib/db";
import { businessDateKey, businessDayEnd, businessDayStart, formatBusinessDate } from "@/lib/dates";
export const dynamic = "force-dynamic";

function safeDate(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : fallback;
}

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; entity?: string }> }) {
  const query = await searchParams;
  const today = businessDateKey(new Date());
  const fromText = safeDate(query.from, today);
  const toText = safeDate(query.to, today);
  let from = businessDayStart(fromText);
  let to = businessDayEnd(toText);
  if (to < from || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    from = businessDayStart(today);
    to = businessDayEnd(today);
  }
  const [logs, entities] = await Promise.all([
    prisma.auditLog.findMany({ where: { createdAt: { gte: from, lte: to }, ...(query.entity ? { entity: query.entity } : {}) }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
  ]);
  return <>
    <h1>Auditoria</h1><p className="muted">Registro de alterações e operações financeiras realizadas no sistema.</p>
    <form className="card filter-bar" method="get"><label>De<input type="date" name="from" defaultValue={fromText} /></label><label>Até<input type="date" name="to" defaultValue={toText} /></label><label>Tipo de registro<select name="entity" defaultValue={query.entity || ""}><option value="">Todos</option>{entities.map(({ entity }) => <option key={entity} value={entity}>{entity}</option>)}</select></label><button className="button">Filtrar</button></form>
    <section className="section card"><h2>Atividades ({logs.length})</h2>{logs.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Data e hora</th><th>Responsável</th><th>Registro</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{formatBusinessDate(log.createdAt, true)}</td><td>{log.actor.name}</td><td>{log.entity}<div className="muted">{log.entityId}</div></td><td>{log.action}</td><td><details><summary>Ver antes/depois</summary><pre className="audit-json">{JSON.stringify({ antes: log.before, depois: log.after }, null, 2)}</pre></details></td></tr>)}</tbody></table></div> : <p className="empty">Nenhuma atividade encontrada no período.</p>}</section>
  </>;
}
