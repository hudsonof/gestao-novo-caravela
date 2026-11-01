import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
export const dynamic="force-dynamic";
export default async function Cofre(){const accounts=process.env.DATABASE_URL?await prisma.financialAccount.findMany({where:{kind:{in:["VAULT","FUND","TRANSIT"]}}}):[];return <><h1>Cofre e fundo central</h1><p className="muted">Controle dos valores internos de custódia.</p><div className="grid section">{accounts.map(a=><div className="card" key={a.id}><div className="muted">{a.name}</div><div className="value">{formatBRL(a.balance)}</div></div>)}</div>{!accounts.length&&<div className="section card empty">Nenhuma conta central configurada.</div>}</>}
