import { prisma } from "@/lib/db";
import { ApiForm } from "@/components/api-form";
export const dynamic = "force-dynamic";

export default async function Categorias() {
  const categories = await prisma.financeCategory.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
  return <>
    <h1>Categorias financeiras</h1><p className="muted">Use categorias consistentes para comparar receitas e despesas nos relatórios. Categorias usadas não são excluídas; podem ser inativadas.</p>
    <div className="form-grid">
      <ApiForm endpoint="/api/categories" title="Nova categoria" fields={[{ name: "name", label: "Nome" }, { name: "type", label: "Tipo", type: "select", options: [{ value: "INCOME", label: "Receita" }, { value: "EXPENSE", label: "Despesa" }] }]} submitLabel="Cadastrar categoria" />
    </div>
    <section className="section card"><h2>Cadastro</h2>{categories.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Nome</th><th>Tipo</th><th>Situação</th><th>Editar</th><th>Ação</th></tr></thead><tbody>{categories.map((category) => <tr key={category.id}><td>{category.name}</td><td>{category.type === "INCOME" ? "Receita" : "Despesa"}</td><td>{category.active ? "Ativa" : "Inativa"}</td><td><ApiForm endpoint={`/api/categories/${category.id}`} method="PATCH" title="Renomear categoria" fields={[{ name: "name", label: "Nome", defaultValue: category.name }]} submitLabel="Salvar" /></td><td><ApiForm endpoint={`/api/categories/${category.id}`} method="PATCH" hidden={{ active: category.active ? "false" : "true" }} title={category.active ? "Inativar categoria" : "Reativar categoria"} fields={[]} submitLabel={category.active ? "Inativar" : "Reativar"} /></td></tr>)}</tbody></table></div> : <p className="empty">Nenhuma categoria cadastrada.</p>}</section>
  </>;
}
