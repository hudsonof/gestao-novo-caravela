"use client";

import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Withdrawal = {
  id: string;
  dateLabel: string;
  amountLabel: string;
  observation: string;
};

type DialogKind = "WITHDRAWAL" | "CLOSING";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function centsFromInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return Number(digits || "0");
}

function formatCents(cents: number) {
  return brl.format(cents / 100);
}

function decimalFromCents(cents: number) {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return String(whole) + "." + fraction;
}

function CurrencyInput({ label, value, onChange, required = true }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  required?: boolean;
}) {
  function change(event: ChangeEvent<HTMLInputElement>) {
    onChange(centsFromInput(event.currentTarget.value));
  }

  return <label className="cash-field">
    <span>{label}</span>
    <input type="text" inputMode="decimal" autoComplete="off" value={formatCents(value)} onChange={change} required={required} />
  </label>;
}

export function CashShiftActions({
  shiftId,
  openingFloat,
  withdrawalsTotal,
  withdrawals,
}: {
  shiftId: string;
  openingFloat: number;
  withdrawalsTotal: number;
  withdrawals: Withdrawal[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyWithdrawalId, setBusyWithdrawalId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [screenMessage, setScreenMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState(0);
  const [observation, setObservation] = useState("");
  const [cashSales, setCashSales] = useState(0);
  const [machineSales, setMachineSales] = useState(0);
  const [countedCash, setCountedCash] = useState(0);
  const [justification, setJustification] = useState("");
  const [confirmDifference, setConfirmDifference] = useState(false);
  const idempotency = useRef<{ key: string; body: string } | null>(null);

  const openingCents = Math.round(openingFloat * 100);
  const withdrawalsCents = Math.round(withdrawalsTotal * 100);
  const provisionalCents = openingCents - withdrawalsCents;
  const expectedCashCents = openingCents + cashSales - withdrawalsCents;
  const differenceCents = countedCash - expectedCashCents;

  function openDialog(kind: DialogKind) {
    setDialog(kind);
    setFormError("");
    setScreenMessage("");
    setWithdrawalAmount(0);
    setObservation("");
    setCashSales(0);
    setMachineSales(0);
    setCountedCash(0);
    setJustification("");
    setConfirmDifference(false);
    idempotency.current = null;
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setFormError("");
  }

  async function send(endpoint: string, payload: Record<string, string>, successMessage: string) {
    const body = JSON.stringify(payload);
    const key = idempotency.current?.body === body ? idempotency.current.key : crypto.randomUUID();
    idempotency.current = { key, body };
    setBusy(true);
    setFormError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-idempotency-key": key },
        body,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
      idempotency.current = null;
      setScreenMessage(successMessage);
      setDialog(null);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  async function submitWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (withdrawalAmount <= 0) {
      setFormError("Informe uma retirada maior que zero.");
      return;
    }
    if (observation.trim().length < 2) {
      setFormError("Descreva o motivo da retirada.");
      return;
    }
    await send("/api/register-shifts/" + shiftId + "/withdrawals", {
      amount: decimalFromCents(withdrawalAmount),
      observation: observation.trim(),
    }, "Retirada registrada.");
  }

  async function submitClosing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (differenceCents !== 0 && justification.trim().length === 0) {
      setFormError("Explique a diferença entre o valor esperado e o dinheiro contado.");
      return;
    }
    if (differenceCents !== 0 && !confirmDifference) {
      setConfirmDifference(true);
      setFormError("");
      return;
    }
    await send("/api/register-shifts/" + shiftId + "/close", {
      cashSales: decimalFromCents(cashSales),
      machineSales: decimalFromCents(machineSales),
      countedCash: decimalFromCents(countedCash),
      justification: justification.trim(),
    }, "Caixa fechado.");
  }

  async function deleteWithdrawal(withdrawal: Withdrawal) {
    setBusyWithdrawalId(withdrawal.id);
    setScreenMessage("");
    try {
      const response = await fetch("/api/register-shifts/" + shiftId + "/withdrawals/" + withdrawal.id, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a retirada.");
      setConfirmDeleteId(null);
      setScreenMessage("Retirada excluída. A conferência será recalculada.");
      router.refresh();
    } catch (error) {
      setScreenMessage(error instanceof Error ? error.message : "Não foi possível excluir a retirada.");
    } finally {
      setBusyWithdrawalId(null);
    }
  }

  return <>
    <div className="cash-shift-actions section">
      <button className="button button-secondary" type="button" onClick={() => openDialog("WITHDRAWAL")}>Registrar retirada</button>
      <button className="button" type="button" onClick={() => openDialog("CLOSING")}>Fechar caixa</button>
    </div>

    {provisionalCents < 0 && <p className="notice notice-warning cash-provisional-warning">
      As retiradas superam o troco inicial. Este cálculo é provisório e ainda não inclui vendas.
    </p>}

    {withdrawals.length > 0 && <details className="section cash-withdrawals">
      <summary>Ver retiradas ({withdrawals.length})</summary>
      <ul className="proof-list cash-withdrawal-list">{withdrawals.map((withdrawal) => <li key={withdrawal.id}>
        <span className="cash-withdrawal-description">{withdrawal.dateLabel} · {withdrawal.amountLabel} · {withdrawal.observation}</span>
        {confirmDeleteId === withdrawal.id ? <span className="cash-delete-confirm">
          <span>Excluir esta retirada?</span>
          <button className="button button-danger button-small" type="button" disabled={busyWithdrawalId === withdrawal.id} onClick={() => deleteWithdrawal(withdrawal)}>
            {busyWithdrawalId === withdrawal.id ? "Excluindo…" : "Confirmar"}
          </button>
          <button className="button button-secondary button-small" type="button" disabled={busyWithdrawalId === withdrawal.id} onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
        </span> : <button className="button button-danger button-small" type="button" disabled={busyWithdrawalId !== null} onClick={() => setConfirmDeleteId(withdrawal.id)}>Excluir</button>}
      </li>)}</ul>
    </details>}

    {screenMessage && <p className="form-message register-message" role="status">{screenMessage}</p>}

    {dialog && <div className="register-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section className="card register-modal cash-shift-modal" role="dialog" aria-modal="true" aria-labelledby="cash-shift-modal-title" onKeyDown={(event) => { if (event.key === "Escape") closeDialog(); }}>
        <div className="register-modal-header">
          <div>
            <h2 id="cash-shift-modal-title">{dialog === "WITHDRAWAL" ? "Retirada do caixa" : "Fechamento e batimento"}</h2>
            <p className="muted cash-modal-subtitle">A operação será registrada para este caixa.</p>
          </div>
          <button className="register-modal-close" type="button" aria-label="Fechar" disabled={busy} onClick={closeDialog}>×</button>
        </div>

        {dialog === "WITHDRAWAL" ? <form className="register-modal-form" onSubmit={submitWithdrawal}>
          <CurrencyInput label="Valor da retirada" value={withdrawalAmount} onChange={(value) => { setWithdrawalAmount(value); setFormError(""); }} />
          <label>Observação
            <textarea name="observation" required minLength={2} maxLength={500} rows={3} value={observation} onChange={(event) => { setObservation(event.currentTarget.value); setFormError(""); }} placeholder="Ex.: retirada para depósito" />
          </label>
          <p className="muted cash-field-help">Retirada acumulada: {formatCents(withdrawalsCents)} · Troco menos retiradas, sem vendas: {formatCents(provisionalCents)}</p>
          {withdrawalAmount > Math.max(provisionalCents, 0) && <p className="notice notice-warning">O valor supera o troco menos retiradas. As vendas ainda não estão incluídas nesse cálculo.</p>}
          {formError && <p className="notice error" role="alert">{formError}</p>}
          <div className="register-modal-actions">
            <button className="button button-secondary" type="button" disabled={busy} onClick={closeDialog}>Cancelar</button>
            <button className="button" type="submit" disabled={busy || withdrawalAmount <= 0}>{busy ? "Salvando…" : "Registrar retirada"}</button>
          </div>
        </form> : <form className="register-modal-form" onSubmit={submitClosing}>
          <CurrencyInput label="Vendas em dinheiro" value={cashSales} onChange={(value) => { setCashSales(value); setConfirmDifference(false); setFormError(""); }} />
          <CurrencyInput label="Vendas (Máquina)" value={machineSales} onChange={(value) => { setMachineSales(value); setFormError(""); }} />
          <CurrencyInput label="Dinheiro contado no caixa" value={countedCash} onChange={(value) => { setCountedCash(value); setConfirmDifference(false); setFormError(""); }} />

          <div className="cash-reconciliation" aria-live="polite">
            <div><span>Dinheiro esperado</span><strong>{formatCents(expectedCashCents)}</strong></div>
            <div className={differenceCents === 0 ? "cash-difference is-balanced" : "cash-difference is-divergent"}>
              <span>{differenceCents === 0 ? "Diferença" : "Diferença a justificar"}</span>
              <strong>{formatCents(differenceCents)}</strong>
            </div>
            <p className="muted">Esperado = troco inicial + vendas em dinheiro − retiradas. Vendas (Máquina) não compõem o dinheiro contado.</p>
          </div>

          {differenceCents !== 0 && <label>Justificativa da diferença
            <textarea required minLength={2} maxLength={500} rows={3} value={justification} onChange={(event) => { setJustification(event.currentTarget.value); setConfirmDifference(false); setFormError(""); }} placeholder="Explique a diferença encontrada" />
          </label>}

          {confirmDifference && differenceCents !== 0 && <div className="notice notice-warning" role="alert">
            <strong>Confirme o fechamento com divergência de {formatCents(differenceCents)}.</strong>
            <div>Confira o dinheiro contado e a justificativa antes de concluir.</div>
          </div>}
          {formError && <p className="notice error" role="alert">{formError}</p>}
          <div className="register-modal-actions">
            <button className="button button-secondary" type="button" disabled={busy} onClick={closeDialog}>Cancelar</button>
            <button className="button" type="submit" disabled={busy || (differenceCents !== 0 && justification.trim().length < 2)}>
              {busy ? "Fechando…" : confirmDifference && differenceCents !== 0 ? "Confirmar fechamento" : "Fechar caixa"}
            </button>
          </div>
        </form>}
      </section>
    </div>}
  </>;
}
