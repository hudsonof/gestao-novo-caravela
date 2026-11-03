import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/authorization";
import { ApiForm } from "@/components/api-form";
import { formatBRL } from "@/lib/money";

export const dynamic = "force-dynamic";
const channelNames = { TICKETS: "Bilheteria", TABLES: "Mesas", BAR: "Bar", WAITER: "Garçons" } as const;
const methodNames = { CASH: "Dinheiro", PIX: "Pix", BANK_TRANSFER: "Transferência", DEBIT: "Débito", CREDIT: "Crédito" } as const;

export default async function PdvSales() {
  await requireManager();
  const orders = await prisma.posOrder.findMany({
    include: { event: { select: { name: true } }, device: { select: { name: true } }, operatorUser: { select: { name: true } }, session: { include: { register: { select: { name: true } } } }, table: { select: { name: true } }, waiter: { select: { name: true } }, items: true, payments: true },
    orderBy: { openedAt: "desc" },
    take: 500,
  });
  return <>
    <h1>Pedidos do PDV</h1>
    <p className="muted">Pedidos recentes por evento, canal, operador, caixa e garçom. Reembolsos geram lançamentos de reversão no razão.</p>
    <section className="section card">{orders.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Data / comanda</th><th>Canal</th><th>Evento / caixa</th><th>Garçom / mesa</th><th>Itens</th><th>Pagamentos</th><th>Total / status</th><th>Ação</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}>
      <td>{order.openedAt.toLocaleString("pt-BR")}<div className="muted">{order.commandCode} · {order.operatorUser?.name || order.device?.name || "—"}</div></td>
      <td>{channelNames[order.channel]}</td><td>{order.event.name}<div className="muted">{order.session.register.name}</div></td>
      <td>{order.waiter?.name || "—"}<div className="muted">{order.tableNameSnapshot || order.table?.name || "—"}</div></td>
      <td>{order.items.map((item) => <div key={item.id}>{item.quantity} × {item.productName} · {formatBRL(item.lineTotal)}</div>)}</td>
      <td>{order.payments.map((payment) => <div key={payment.id}>{methodNames[payment.method]} · {formatBRL(payment.amount)}</div>)}</td>
      <td>{formatBRL(order.total)}<div className={order.status === "PAID" ? "tag" : "tag tag-neutral"}>{order.status}</div>{order.cancelReason && <div className="muted">{order.cancelReason}</div>}</td>
      <td>{order.status === "OPEN" ? <ApiForm endpoint={`/api/pos/orders/${order.id}/cancel`} title="Cancelar comanda" fields={[{ name: "reason", label: "Motivo do cancelamento" }]} submitLabel="Cancelar" /> : order.status === "PAID" ? <ApiForm endpoint={`/api/pos/orders/${order.id}/refund`} title="Estornar venda" fields={[{ name: "reason", label: "Motivo do estorno" }]} submitLabel="Estornar e devolver" /> : "—"}</td>
    </tr>)}</tbody></table></div> : <p className="empty">Nenhum pedido do PDV registrado.</p>}</section>
  </>;
}
