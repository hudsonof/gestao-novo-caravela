import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/authorization";
import { ApiForm } from "@/components/api-form";
import { PosDeviceManager } from "@/components/pos-device-manager";

export const dynamic = "force-dynamic";
const typeLabels = { ENTRY: "Entrada", TABLE: "Mesa", BAR: "Bar" } as const;
const profileNames = { TICKETS: "Bilheteria", TABLES: "Mesas", BAR: "Bar", WAITER: "Garçons" } as const;

export default async function PdvManagement() {
  await requireManager();
  const [products, events, tables, devices, registers] = await Promise.all([
    prisma.posProduct.findMany({ include: { eventPrices: { include: { event: { select: { name: true } } } }, _count: { select: { orderItems: true } } }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.event.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: { startsAt: "desc" } }),
    prisma.posTable.findMany({ orderBy: { name: "asc" } }),
    prisma.posDevice.findMany({ select: { id: true, name: true, profile: true, cashRegisterId: true, active: true, cashRegister: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.cashRegister.findMany({ where: { active: true }, orderBy: [{ sector: "asc" }, { name: "asc" }] }),
  ]);
  const productOptions = products.filter((p) => p.active).map((p) => ({ value: p.id, label: `${typeLabels[p.type]} · ${p.name}` }));
  const eventOptions = events.map((e) => ({ value: e.id, label: e.name }));
  const registerOptions = registers.map((r) => ({ value: r.id, label: `${r.name} · ${profileNames[r.sector]}` }));

  return <>
    <h1>PDV e catálogos</h1>
    <p className="muted">Configure produtos, preços por evento, mesas e credenciais dos terminais de venda.</p>
    <section className="section card">
      <h2>Catálogo</h2>
      <div className="form-grid">
        <ApiForm endpoint="/api/pos/products" title="Novo produto ou tipo de entrada/mesa" fields={[
          { name: "name", label: "Nome" },
          { name: "type", label: "Categoria", type: "select", options: [{ value: "ENTRY", label: "Entrada" }, { value: "TABLE", label: "Mesa" }, { value: "BAR", label: "Produto do bar" }] },
          { name: "description", label: "Descrição", required: false },
          { name: "basePrice", label: "Preço padrão", type: "number", min: "0.01", step: "0.01" },
        ]} submitLabel="Cadastrar produto" />
        <ApiForm endpoint="/api/pos/prices" title="Definir preço para evento" fields={[
          { name: "productId", label: "Produto", type: "select", options: productOptions },
          { name: "eventId", label: "Evento", type: "select", options: eventOptions },
          { name: "price", label: "Preço neste evento", type: "number", min: "0.01", step: "0.01" },
        ]} submitLabel="Salvar preço do evento" />
      </div>
      {products.length ? <div className="table-scroll section"><table className="table"><thead><tr><th>Produto</th><th>Tipo</th><th>Preço padrão</th><th>Preços por evento</th><th>Status / edição</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}>
        <td>{product.name}<div className="muted">{product.description || ""}</div></td>
        <td>{typeLabels[product.type]}</td>
        <td>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(product.basePrice))}</td>
        <td>{product.eventPrices.length ? product.eventPrices.map((price) => <div key={price.id}>{price.event.name}: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(price.price))}</div>) : "—"}</td>
        <td><span className={product.active ? "tag" : "tag tag-neutral"}>{product.active ? "ATIVO" : "INATIVO"}</span>
          <ApiForm endpoint={`/api/pos/products/${product.id}`} method="PATCH" title="Editar produto" fields={[
            { name: "name", label: "Nome", defaultValue: product.name },
            { name: "description", label: "Descrição", required: false, defaultValue: product.description || "" },
            { name: "type", label: "Tipo", type: "select", defaultValue: product.type, options: [{ value: "ENTRY", label: "Entrada" }, { value: "TABLE", label: "Mesa" }, { value: "BAR", label: "Bar" }] },
            { name: "basePrice", label: "Preço padrão", type: "number", min: "0.01", step: "0.01", defaultValue: product.basePrice.toFixed(2) },
          ]} submitLabel="Salvar" />
          <ApiForm endpoint={`/api/pos/products/${product.id}`} method="PATCH" hidden={{ active: product.active ? "false" : "true" }} title={product.active ? "Inativar produto" : "Reativar produto"} fields={[]} submitLabel={product.active ? "Inativar" : "Reativar"} />
        </td>
      </tr>)}</tbody></table></div> : <p className="empty">Nenhum produto cadastrado.</p>}
    </section>
    <section className="section card">
      <h2>Mesas</h2>
      <div className="form-grid">
        <ApiForm endpoint="/api/pos/tables" title="Cadastrar mesa" fields={[{ name: "name", label: "Identificador/nome da mesa" }]} submitLabel="Cadastrar mesa" />
        {tables.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Mesa</th><th>Status</th><th>Ação</th></tr></thead><tbody>{tables.map((table) => <tr key={table.id}><td>{table.name}</td><td>{table.active ? "Ativa" : "Inativa"}</td><td><ApiForm endpoint={`/api/pos/tables/${table.id}`} method="PATCH" hidden={{ active: table.active ? "false" : "true" }} title={table.active ? "Inativar mesa" : "Reativar mesa"} fields={[]} submitLabel={table.active ? "Inativar" : "Reativar"} /></td></tr>)}</tbody></table></div> : <p className="empty">Nenhuma mesa cadastrada.</p>}
      </div>
    </section>
    <PosDeviceManager devices={devices} registers={registerOptions} />
  </>;
}
