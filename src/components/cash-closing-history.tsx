"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ClosingRecord = {
  id: string;
  registerName: string;
  sector: "TICKETS" | "TABLES" | "BAR";
  sectorLabel: string;
  employeeName: string;
  closedAt: string;
  dateLabel: string;
  cashSales: string;
  machineSales: string;
  expectedCash: string | null;
  countedCash: string | null;
  difference: number | null;
  differenceLabel: string | null;
  justification: string | null;
  withdrawalsTotal: string;
  withdrawals: string[];
};

const sectorOptions = [
  { value: "TICKETS", label: "Bilheteria" },
  { value: "TABLES", label: "Mesas" },
  { value: "BAR", label: "Bar" },
] as const;

export function CashClosingHistory({ records, canDelete }: { records: ClosingRecord[]; canDelete: boolean }) {
  const router = useRouter();
  const [period, setPeriod] = useState("30");
  const [sector, setSector] = useState("");
  const [result, setResult] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const visible = useMemo(() => {
    const cutoff = period === "all" ? null : Date.now() - Number(period) * 24 * 60 * 60 * 1000;
    return records.filter((record) => {
      const matchesPeriod = cutoff === null || new Date(record.closedAt).getTime() >= cutoff;
      const matchesSector = !sector || record.sector === sector;
      const hasDifference = record.difference !== null && record.difference !== 0;
      const matchesResult = !result || (result === "difference" ? hasDifference : record.difference === 0);
      return matchesPeriod && matchesSector && matchesResult;
    });
  }, [records, period, sector, result]);

  async function deleteRecord(record: ClosingRecord) {
    if (deletingId) return;
    const confirmed = window.confirm(
      "Excluir o fechamento de " + record.registerName + " em " + record.dateLabel +
      "? A operação, o fechamento e as retiradas vinculadas serão removidos do histórico. Esta ação não pode ser desfeita pelo sistema."
    );
    if (!confirmed) return;

    setDeletingId(record.id);
    setDeleteFeedback(null);
    try {
      const response = await fetch("/api/register-shifts/" + encodeURIComponent(record.id), { method: "DELETE" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir o fechamento.");
      setDeleteFeedback({ type: "success", text: "Fechamento excluído com sucesso." });
      router.refresh();
    } catch (error) {
      setDeleteFeedback({ type: "error", text: error instanceof Error ? error.message : "Não foi possível excluir o fechamento." });
    } finally {
      setDeletingId(null);
    }
  }

  function deleteButton(record: ClosingRecord) {
    const deleting = deletingId === record.id;
    return <button
      className="button button-danger button-small cash-history-delete"
      type="button"
      disabled={deletingId !== null}
      aria-label={"Excluir fechamento de " + record.registerName + " em " + record.dateLabel}
      onClick={() => void deleteRecord(record)}
    >{deleting ? "Excluindo…" : "Excluir"}</button>;
  }

  return <section className="section card cash-history">
    <div className="cash-history-header">
      <div>
        <h2>Fechamentos recentes</h2>
        <p className="muted">Até 100 operações recentes. Filtre por período, setor ou resultado.</p>
      </div>
      <span className="tag tag-neutral">{visible.length} de {records.length}</span>
    </div>

    {deleteFeedback && <p className={deleteFeedback.type === "error" ? "notice error" : "form-message"} role={deleteFeedback.type === "error" ? "alert" : "status"}>{deleteFeedback.text}</p>}

    <div className="cash-history-filters">
      <label>Período
        <select value={period} onChange={(event) => setPeriod(event.currentTarget.value)}>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="all">Todos os 100 recentes</option>
        </select>
      </label>
      <label>Setor
        <select value={sector} onChange={(event) => setSector(event.currentTarget.value)}>
          <option value="">Todos</option>
          {sectorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>Resultado
        <select value={result} onChange={(event) => setResult(event.currentTarget.value)}>
          <option value="">Todos</option>
          <option value="balanced">Sem diferença</option>
          <option value="difference">Com diferença</option>
        </select>
      </label>
    </div>

    {visible.length ? <>
      <div className="table-scroll cash-history-table-wrap">
        <table className="table">
          <thead><tr><th>Caixa / data</th><th>Responsável</th><th>Dinheiro</th><th>Máquina</th><th>Esperado</th><th>Contado</th><th>Diferença</th><th>Retiradas</th>{canDelete && <th>Ações</th>}</tr></thead>
          <tbody>{visible.map((record) => <tr key={record.id}>
            <td><strong>{record.registerName}</strong><div className="muted">{record.sectorLabel} · {record.dateLabel}</div></td>
            <td>{record.employeeName}</td>
            <td>{record.cashSales}</td>
            <td>{record.machineSales}</td>
            <td>{record.expectedCash || "—"}</td>
            <td>{record.countedCash || "—"}</td>
            <td>{record.differenceLabel === null ? "—" : <><span className={record.difference === 0 ? "tag tag-neutral" : "tag tag-warning"}>{record.difference === 0 ? "Conferido" : record.differenceLabel}</span>{record.justification && <div className="muted">{record.justification}</div>}</>}</td>
            <td><details><summary>{record.withdrawalsTotal}</summary><ul className="proof-list">{record.withdrawals.map((withdrawal, index) => <li key={record.id + "-withdrawal-" + index}>{withdrawal}</li>)}</ul></details></td>
            {canDelete && <td>{deleteButton(record)}</td>}
          </tr>)}</tbody>
        </table>
      </div>

      <div className="cash-history-cards">{visible.map((record) => <article className="cash-history-item" key={record.id}>
        <div className="cash-history-item-head"><div><strong>{record.registerName}</strong><div className="muted">{record.sectorLabel} · {record.dateLabel}</div></div><span className={record.difference === 0 ? "tag tag-neutral" : "tag tag-warning"}>{record.difference === 0 ? "Conferido" : record.differenceLabel || "Sem fechamento"}</span></div>
        <div className="cash-history-values">
          <div><span>Vendas em dinheiro</span><strong>{record.cashSales}</strong></div>
          <div><span>Vendas (Máquina)</span><strong>{record.machineSales}</strong></div>
          <div><span>Dinheiro esperado</span><strong>{record.expectedCash || "—"}</strong></div>
          <div><span>Dinheiro contado</span><strong>{record.countedCash || "—"}</strong></div>
          <div><span>Responsável</span><strong>{record.employeeName}</strong></div>
          <div><span>Retiradas</span><strong>{record.withdrawalsTotal}</strong></div>
        </div>
        {record.justification && <p className="muted">{record.justification}</p>}
        {canDelete && <div className="cash-history-actions">{deleteButton(record)}</div>}
      </article>)}</div>
    </> : <div className="empty cash-history-empty">{records.length ? "Nenhum fechamento corresponde aos filtros. Ajuste o período, setor ou resultado." : "Os fechamentos serão exibidos aqui após a primeira operação encerrada."}</div>}
  </section>;
}
