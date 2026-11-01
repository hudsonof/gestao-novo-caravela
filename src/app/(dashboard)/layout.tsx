import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { logout } from "../actions";

const links = [
  ["/", "Visão geral"],
  ["/eventos", "Eventos"],
  ["/caixas", "Caixas"],
  ["/movimentacoes", "Movimentações"],
  ["/despesas", "Contas a pagar"],
  ["/cofre", "Cofre central"],
  ["/relatorios", "Relatórios"],
  ["/equipe", "Colaboradores"],
];

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">NOVO CARAVELA<small>Gestão financeira de eventos</small></div>
        <nav className="nav">
          {links.map(([href, name]) => <Link key={href} href={href} className="navlink">{name}</Link>)}
          {session.user.role === "ADMIN" && <Link href="/usuarios" className="navlink">Usuários</Link>}
        </nav>
        <div className="sidebar-user">
          <span>{session.user.name} · {session.user.role === "ADMIN" ? "Administrador" : "Gerente"}</span>
          <form action={logout}><button className="link-button" type="submit">Sair</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
