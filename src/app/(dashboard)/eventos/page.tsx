import { prisma } from "@/lib/db";
import { ApiForm } from "@/components/api-form";
import { formatBusinessDate } from "@/lib/dates";
export const dynamic = "force-dynamic";

export default async function Eventos() {
  const events = await prisma.event.findMany({ orderBy: { startsAt: "desc" }, take: 200 });
  return <>
    <h1>Eventos</h1><p className="muted">Abra o evento antes de iniciar sessões e lançamentos associados.</p>
    <div className="form-grid"><ApiForm endpoint="/api/events" title="Novo evento" fields={[
      { name: "name", label: "Nome do evento" },
      { name: "startsAt", label: "Início", type: "datetime-local" },
      { name: "endsAt", label: "Término (opcional)", type: "datetime-local", required: false },
      { name: "notes", label: "Observações", required: false },
    ]} submitLabel="Cadastrar evento" /></div>
    <section className="section card"><h2>Agenda e status</h2>{events.length ? <table className="table"><thead><tr><th>Evento</th><th>Data</th><th>Status</th><th>Ação</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.name}</td><td>{formatBusinessDate(event.startsAt, true)}</td><td><span className="tag tag-neutral">{event.status}</span></td><td>{event.status === "PLANNED" ? <ApiForm endpoint={`/api/events/${event.id}/open`} title="Abrir evento" fields={[]} submitLabel="Abrir" /> : event.status === "OPEN" || event.status === "CLOSING" ? <ApiForm endpoint={`/api/events/${event.id}/close`} title="Encerrar evento" fields={[]} submitLabel="Encerrar" /> : "—"}</td></tr>)}</tbody></table> : <p className="empty">Nenhum evento cadastrado.</p>}</section>
  </>;
}
