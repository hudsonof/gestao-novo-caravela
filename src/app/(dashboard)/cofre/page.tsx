import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { ApiForm } from "@/components/api-form";
import { formatBusinessDate } from "@/lib/dates";
export const dynamic = "force-dynamic";

export default async function Cofre() {
  const [accounts, deposits] = await Promise.all([
    prisma.financialAccount.findMany({ where: { active: true, kind: { in: ["VAULT", "FUND", "TRANSIT", "BANK", "RECEIVABLE"] } }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.deposit.findMany({ include: { withdrawal: true, confirmation: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const banks = accounts.filter((account) => account.kind === "BANK");
  const fund = accounts.find((account) => account.kind === "FUND");
  const totals = ["FUND", "VAULT", "TRANSIT"].map((kind) => ({ kind, amount: accounts.filter((account) => account.kind === kind).reduce((sum, account) => sum + Number(account.balance), 0) }));
  return <>
    <h1>Cofre e fundo de troco</h1><p className="muted">O cofre é a custódia central. Depósitos passam por trânsito até a confirmação bancária.</p>
    <div className="grid">{totals.map((item) => <div className="card" key={item.kind}><div className="muted">{item.kind === "FUND" ? "Fundo de troco" : item.kind === "VAULT" ? "Cofre central" : "Em trânsito"}</div><div className="value">{formatBRL(item.amount)}</div></div>)}</div>
    <div className="form-grid section">
      {fund && <ApiForm endpoint="/api/transactions" title="Ajustar fundo central" hidden={{ kind: "ADJUSTMENT", accountId: fund.id }} fields={[
        { name: "direction", label: "Tipo", type: "select", options: [{ value: "IN", label: "Entrada no fundo" }, { value: "OUT", label: "Retirada do fundo" }] },
        { name: "amount", label: "Valor", type: "number", min: "0.01", step: "0.01" }, { name: "reason", label: "Justificativa" },
      ]} submitLabel="Registrar ajuste" />}
      <ApiForm endpoint="/api/deposits" title="Retirar do cofre para depósito" fields={[
        { name: "amount", label: "Valor do malote", type: "number", min: "0.01", step: "0.01" }, { name: "description", label: "Identificação / observação", required: false },
      ]} submitLabel="Enviar para trânsito" />
    </div>
    <section className="section"><h2>Depósitos e contas centrais</h2><div className="grid">{accounts.map((account) => <div className="card" key={account.id}><span className="tag tag-neutral">{account.kind}</span><div>{account.name}</div><div className="value">{formatBRL(account.balance)}</div></div>)}</div></section>
    <section className="section card"><h2>Malotes</h2>{deposits.length ? <div className="deposit-list">{deposits.map((deposit) => <div className="deposit-row" key={deposit.id}><div><strong>{formatBRL(deposit.amount)}</strong><div className="muted">{formatBusinessDate(deposit.createdAt, true)} · {deposit.status}{deposit.bankReference ? ` · ${deposit.bankReference}` : ""}</div></div>{deposit.status === "IN_TRANSIT" && <div className="form-grid compact-forms">{banks.length ? <ApiForm endpoint={`/api/deposits/${deposit.id}/confirm`} title="Confirmar crédito no banco" fields={[{ name: "bankAccountId", label: "Conta bancária", type: "select", options: banks.map((bank) => ({ value: bank.id, label: bank.name })) }, { name: "bankReference", label: "Comprovante / referência", required: false }]} submitLabel="Confirmar depósito" /> : <span className="muted">Cadastre uma conta bancária antes da confirmação.</span>}<ApiForm endpoint={`/api/deposits/${deposit.id}/cancel`} title="Cancelar malote" fields={[{ name: "reason", label: "Motivo do cancelamento" }]} submitLabel="Cancelar e devolver ao cofre" /></div>}</div>)}</div> : <p className="empty">Nenhum depósito registrado.</p>}</section>
  </>;
}
