"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiForm } from "@/components/api-form";

type Withdrawal = {
  id: string;
  dateLabel: string;
  amountLabel: string;
  observation: string;
};

export function CashShiftActions({ shiftId, withdrawals }: { shiftId: string; withdrawals: Withdrawal[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"WITHDRAWAL" | "CLOSING" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function deleteWithdrawal(withdrawal: Withdrawal) {
    if (!window.confirm("Excluir esta retirada de " + withdrawal.amountLabel + "? O saldo esperado do caixa será recalculado.")) return;
    setBusyId(withdrawal.id);
    setMessage("");
    try {
      const response = await fetch("/api/register-shifts/" + shiftId + "/withdrawals/" + withdrawal.id, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a retirada.");
      setMessage("Retirada excluída.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir a retirada.");
    } finally {
      setBusyId(null);
    }
  }

  function closeDialog() {
    setDialog(null);
  }

  return <>
    <div className="cash-shift-actions section">
      <button className="button" type="button" onClick={() => { setMessage(""); setDialog("WITHDRAWAL"); }}>Retirada do caixa</button>
      <button className="button button-secondary" type="button" onClick={() => { setMessage(""); setDialog("CLOSING"); }}>Fechamento e batimento</button>
    </div>

    {withdrawals.length > 0 && <details className="section">
      <summary>Ver retiradas ({withdrawals.length})</summary>
      <ul className="proof-list cash-withdrawal-list">{withdrawals.map((withdrawal) => <li key={withdrawal.id}>
        <span>{withdrawal.dateLabel} · {withdrawal.amountLabel} · {withdrawal.observation}</span>
        <button className="button button-danger button-small" type="button" disabled={busyId === withdrawal.id} onClick={() => deleteWithdrawal(withdrawal)}>
          {busyId === withdrawal.id ? "Excluindo…" : "Excluir"}
        </button>
      </li>)}</ul>
    </details>}

    {message && <p className="form-message register-message" role="status">{message}</p>}

    {dialog && <div className="register-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section className="card register-modal cash-shift-modal" role="dialog" aria-modal="true" aria-labelledby="cash-shift-modal-title" onKeyDown={(event) => { if (event.key === "Escape") closeDialog(); }}>
        <div className="register-modal-header">
          <h2 id="cash-shift-modal-title">{dialog === "WITHDRAWAL" ? "Retirada do caixa" : "Fechamento e batimento"}</h2>
          <button className="register-modal-close" type="button" aria-label="Fechar" onClick={closeDialog}>×</button>
        </div>
        {dialog === "WITHDRAWAL" ? <ApiForm endpoint={"/api/register-shifts/" + shiftId + "/withdrawals"} title="Registrar retirada" onSuccess={closeDialog} fields={[
          { name: "amount", label: "Valor da retirada", type: "number", min: "0.01", step: "0.01" },
          { name: "observation", label: "Observação" },
        ]} submitLabel="Registrar retirada" /> : <>
          <p className="muted cash-shift-help">Dinheiro esperado = troco inicial + vendas em dinheiro − retiradas. Diferenças exigem justificativa.</p>
          <ApiForm endpoint={"/api/register-shifts/" + shiftId + "/close"} title="Fechar caixa" onSuccess={closeDialog} fields={[
            { name: "cashSales", label: "Vendas em dinheiro", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
            { name: "machineSales", label: "Vendas (Máquina)", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
            { name: "countedCash", label: "Dinheiro contado no caixa", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
            { name: "justification", label: "Justificativa da diferença (se houver)", required: false },
          ]} submitLabel="Fechar caixa" />
        </>}
      </section>
    </div>}
  </>;
}
