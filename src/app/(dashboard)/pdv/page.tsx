import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/authorization";
import { ApiForm } from "@/components/api-form";
import { DeleteResourceButton } from "@/components/delete-resource-button";
import { PosProductManager } from "@/components/pos-product-manager";
import { signedImageUrl } from "@/lib/firebase-storage";

export const dynamic = "force-dynamic";
const typeLabels = { ENTRY: "Entrada", TABLE: "Mesa", BAR: "Bar" } as const;
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function PdvManagement() {
  await requireManager();
  const [products, events, tables] = await Promise.all([
    prisma.posProduct.findMany({ include: { eventPrices: { include: { event: { select: { name: true } } } }, _count: { select: { orderItems: true } } }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.event.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: { startsAt: "desc" } }),
    prisma.posTable.findMany({ include: { _count: { select: { orders: true } } }, orderBy: { name: "asc" } }),
  ]);

  const productRows = await Promise.all(products.map(async (product) => {
    let imageUrl: string | null = null;
    if (product.imagePath) {
      try { imageUrl = signedImageUrl(product.imagePath); } catch { imageUrl = null; }
    }
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      type: product.type,
      basePrice: product.basePrice.toFixed(2),
      active: product.active,
      imagePath: product.imagePath,
      imageUrl,
      hasHistory: product._count.orderItems > 0,
      hasEventPrices: product.eventPrices.length > 0,
    };
  }));
  const productOptions = products.filter((p) => p.active).map((p) => ({ value: p.id, label: `${typeLabels[p.type]} · ${p.name}` }));
  const eventOptions = events.map((e) => ({ value: e.id, label: e.name }));

  return <>
    <h1>PDV e catálogos</h1>
    <p className="muted">Configure produtos, preços por evento e mesas. Os usuários e perfis do PDV são gerenciados em Acessos ao sistema.</p>
    <PosProductManager products={productRows} />
    <section className="section card">
      <h2>Preços por evento</h2>
      <div className="form-grid">
        <ApiForm endpoint="/api/pos/prices" title="Definir ou atualizar preço para evento" fields={[
          { name: "productId", label: "Produto", type: "select", options: productOptions },
          { name: "eventId", label: "Evento", type: "select", options: eventOptions },
          { name: "price", label: "Preço neste evento", type: "number", min: "0.01", step: "0.01" },
        ]} submitLabel="Salvar preço do evento" />
        {products.some((product) => product.eventPrices.length > 0) ? <div className="table-scroll"><table className="table"><thead><tr><th>Produto</th><th>Evento</th><th>Preço</th></tr></thead><tbody>{products.flatMap((product) => product.eventPrices.map((price) => <tr key={price.id}><td>{product.name}</td><td>{price.event.name}</td><td>{brl.format(Number(price.price))}</td></tr>))}</tbody></table></div> : <p className="empty">Nenhum preço específico por evento.</p>}
      </div>
    </section>
    <section className="section card">
      <h2>Mesas</h2>
      <div className="form-grid">
        <ApiForm endpoint="/api/pos/tables" title="Cadastrar mesa" fields={[{ name: "name", label: "Identificador/nome da mesa" }]} submitLabel="Cadastrar mesa" />
        {tables.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Mesa</th><th>Status</th><th>Ação</th></tr></thead><tbody>{tables.map((table) => <tr key={table.id}><td>{table.name}</td><td>{table.active ? "Ativa" : "Inativa"}</td><td><ApiForm endpoint={`/api/pos/tables/${table.id}`} method="PATCH" title="Renomear mesa" fields={[{ name: "name", label: "Identificador da mesa", defaultValue: table.name }]} submitLabel="Salvar" /><ApiForm endpoint={`/api/pos/tables/${table.id}`} method="PATCH" hidden={{ active: table.active ? "false" : "true" }} title={table.active ? "Inativar mesa" : "Reativar mesa"} fields={[]} submitLabel={table.active ? "Inativar" : "Reativar"} /><DeleteResourceButton endpoint={`/api/pos/tables/${table.id}`} label="Excluir" confirmMessage={`Excluir a mesa “${table.name}”? Esta ação não pode ser desfeita.`} disabled={table._count.orders > 0} /></td></tr>)}</tbody></table></div> : <p className="empty">Nenhuma mesa cadastrada.</p>}
      </div>
    </section>
  </>;
}
