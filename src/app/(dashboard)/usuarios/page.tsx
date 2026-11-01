import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/authorization";
import { ApiForm } from "@/components/api-form";
export const dynamic = "force-dynamic";

export default async function Usuarios() {
  const actor = await requireAdmin();
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  return <>
    <h1>Acessos ao sistema</h1><p className="muted">Somente administradores e gerentes têm credenciais; colaboradores de caixa não precisam acessar o sistema.</p>
    <div className="form-grid"><ApiForm endpoint="/api/admin/users" title="Criar usuário" fields={[{ name: "name", label: "Nome" }, { name: "email", label: "E-mail", type: "email" }, { name: "password", label: "Senha (mínimo 14 caracteres)", type: "password" }, { name: "role", label: "Perfil", type: "select", options: [{ value: "MANAGER", label: "Gerente" }, { value: "ADMIN", label: "Administrador" }] }]} submitLabel="Criar usuário" /></div>
    <section className="section card"><h2>Usuários</h2><table className="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ação</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.active ? "Ativo" : "Inativo"}</td><td>{user.id === actor.userId ? "Usuário atual" : <ApiForm endpoint={`/api/admin/users/${user.id}/active`} method="PATCH" hidden={{ active: user.active ? "false" : "true" }} title={user.active ? "Desativar usuário" : "Ativar usuário"} fields={[]} submitLabel={user.active ? "Desativar" : "Ativar"} />}</td></tr>)}</tbody></table></section>
  </>;
}
