import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { logout } from "../actions";

const links = [
  ["/caixas", "Controle de caixas"],
  ["/equipe", "Colaboradores"],
];

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") redirect("/acesso-pdv");

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">NOVO CARAVELA<small>Gestão simplificada</small></div>
        <nav className="nav">
          {links.map(([href, name]) => <Link key={href} href={href} className="navlink">{name}</Link>)}
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
