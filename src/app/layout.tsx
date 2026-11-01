import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = { title: "Novo Caravela | Gestão Financeira", description: "Gestão de eventos, caixas e fluxo financeiro" };
const links = [["/", "Visão geral"], ["/eventos", "Eventos"], ["/caixas", "Caixas"], ["/movimentacoes", "Movimentações"], ["/despesas", "Contas a pagar"], ["/cofre", "Cofre central"]];
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
 return <html lang="pt-BR"><body><div className="layout"><aside className="sidebar"><div className="brand">NOVO CARAVELA<small>Gestão financeira de eventos</small></div><nav className="nav">{links.map(([href,name])=><Link key={href} href={href} className="navlink">{name}</Link>)}</nav></aside><main className="main">{children}</main></div></body></html>;
}
