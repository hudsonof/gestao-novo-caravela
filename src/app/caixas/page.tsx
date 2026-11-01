import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
export const dynamic="force-dynamic";
export default async function Caixas(){const rows=process.env.DATABASE_URL?await prisma.cashSession.findMany({include:{register:true,account:true,event:true},orderBy:{openedAt:"desc"},take:100}):[];return <><h1>Caixas</h1><p className="muted">Sessões de bilheteria, mesas e bar.</p><div className="section card"><table className="table"><thead><tr><th>Caixa</th><th>Evento</th><th>Saldo</th><th>Status</th></tr></thead><tbody>{rows.map(s=><tr key={s.id}><td>{s.register.name}</td><td>{s.event.name}</td><td>{formatBRL(s.account.balance)}</td><td>{s.status}</td></tr>)}</tbody></table>{!rows.length&&<p className="empty">Nenhuma sessão encontrada.</p>}</div></>}
