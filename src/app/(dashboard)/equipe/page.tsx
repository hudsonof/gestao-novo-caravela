import { prisma } from "@/lib/db";
import { ApiForm } from "@/components/api-form";
export const dynamic = "force-dynamic";

export default async function Equipe() {
  const employees = await prisma.employee.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return <>
    <h1>Colaboradores</h1><p className="muted">Cadastre a equipe que pode ser associada à abertura de cada caixa.</p>
    <div className="form-grid"><ApiForm endpoint="/api/employees" title="Novo colaborador" fields={[{ name: "name", label: "Nome" }, { name: "position", label: "Função", required: false }]} submitLabel="Cadastrar colaborador" /></div>
    <section className="section card"><h2>Equipe cadastrada</h2>{employees.length ? <table className="table"><thead><tr><th>Nome</th><th>Função</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td>{employee.name}</td><td>{employee.position || "—"}</td><td>{employee.active ? "Ativo" : "Inativo"}</td><td><ApiForm endpoint={`/api/employees/${employee.id}/active`} method="PATCH" hidden={{ active: employee.active ? "false" : "true" }} title={employee.active ? "Inativar colaborador" : "Reativar colaborador"} fields={[]} submitLabel={employee.active ? "Inativar" : "Reativar"} /></td></tr>)}</tbody></table> : <p className="empty">Nenhum colaborador cadastrado.</p>}</section>
  </>;
}
