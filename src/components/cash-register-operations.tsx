"use client";

import { useEffect, useState } from "react";

type Operation = {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  employeeName: string | null;
  openingFloat: string;
  withdrawalsTotal: string;
  withdrawalsCount: number;
  cashSales: string | null;
  machineSales: string | null;
  expectedCash: string | null;
  countedCash: string | null;
  difference: string | null;
  differenceLabel: string | null;
};

type OperationsData = {
  register: { id: string; name: string };
  operations: Operation[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalOperations: number;
  legacySessionCount: number;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function CashRegisterOperations({
  register,
  onClose,
  onChanged,
}: {
  register: { id: string; name: string };
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<OperationsData | null>(null);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    fetch("/api/registers/" + encodeURIComponent(register.id) + "/operations?page=" + page, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as OperationsData & { error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar as operações.");
        if (active) {
          setData(result);
          setPage(result.page);
        }
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as operações.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [register.id, page, refreshKey]);

  async function removeOperation(operation: Operation) {
    if (deletingId || clearing) return;
    const confirmed = window.confirm(
      "Remover a operação aberta em " + formatDate(operation.openedAt) +
      "? O fechamento e as retiradas vinculadas também serão removidos. Esta ação será registrada na auditoria."
    );
    if (!confirmed) return;

    setDeletingId(operation.id);
    setMutationError("");
    setMessage("");
    try {
      const response = await fetch("/api/register-shifts/" + encodeURIComponent(operation.id), { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível remover a operação.");
      setMessage("Operação removida.");
      setRefreshKey((value) => value + 1);
      onChanged();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Não foi possível remover a operação.");
    } finally {
      setDeletingId(null);
    }
  }

  async function clearOperations() {
    if (clearing || deletingId) return;
    setClearing(true);
    setMutationError("");
    setMessage("");
    try {
      const response = await fetch("/api/registers/" + encodeURIComponent(register.id) + "/operations", { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { deletedCount?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível limpar as operações.");
      setConfirmClear(false);
      setMessage(result.deletedCount === 1 ? "1 operação removida." : (result.deletedCount || 0) + " operações removidas.");
      setPage(1);
      setRefreshKey((value) => value + 1);
      onChanged();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Não foi possível limpar as operações.");
    } finally {
      setClearing(false);
    }
  }

  return <div className="register-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !clearing && !deletingId) onClose(); }}>
    <section
      className="card register-modal cash-register-operations-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-register-operations-title"
      aria-busy={loading || clearing || deletingId !== null}
      onKeyDown={(event) => { if (event.key === "Escape" && !clearing && !deletingId) onClose(); }}
    >
      <div className="register-modal-header">
        <div>
          <p className="eyebrow">Cadastro de caixas</p>
          <h2 id="cash-register-operations-title">Operações · {register.name}</h2>
          <p className="muted cash-operations-subtitle">Confira e remova operações deste caixa.</p>
        </div>
        <button className="register-modal-close" type="button" aria-label="Fechar operações" disabled={loading || clearing || deletingId !== null} onClick={onClose}>×</button>
      </div>

      {data && <div className="cash-operations-toolbar">
        <span className="tag tag-neutral">{data.totalOperations} {data.totalOperations === 1 ? "operação" : "operações"}</span>
        {data.totalOperations > 0 && !confirmClear && <button className="button button-danger button-small" type="button" disabled={loading || clearing || deletingId !== null} onClick={() => { setMutationError(""); setConfirmClear(true); }}>Limpar todas as operações</button>}
      </div>}

      {confirmClear && data && <div className="notice notice-warning cash-operations-confirm" role="alert">
        <p>Remover as {data.totalOperations} operações abertas e fechadas deste caixa? A exclusão ficará registrada na auditoria e não poderá ser desfeita.</p>
        <div className="register-modal-actions">
          <button className="button button-secondary button-small" type="button" disabled={loading || clearing} onClick={() => setConfirmClear(false)}>Cancelar</button>
          <button className="button button-danger button-small" type="button" disabled={loading || clearing} onClick={() => void clearOperations()}>{clearing ? "Limpando…" : "Confirmar limpeza"}</button>
        </div>
      </div>}

      {data && data.legacySessionCount > 0 && <p className="notice cash-operations-legacy" role="note">
        {data.legacySessionCount} {data.legacySessionCount === 1 ? "sessão antiga permanece" : "sessões antigas permanecem"} preservadas por estarem ligadas ao histórico financeiro. Elas não entram nesta limpeza.
      </p>}
      {message && <p className="form-message" role="status">{message}</p>}
      {mutationError && <p className="notice error" role="alert">{mutationError}</p>}
      {loadError && <div className="notice error" role="alert">{loadError}<button className="button button-secondary button-small" type="button" onClick={() => setRefreshKey((value) => value + 1)}>Tentar novamente</button></div>}

      {loading ? <div className="empty cash-operations-empty">Carregando operações…</div> : data && !loadError && <>
        {data.operations.length ? <>
          <div className="table-scroll cash-operations-table-wrap">
            <table className="table cash-operations-table">
              <thead><tr><th>Abertura</th><th>Situação</th><th>Responsável</th><th>Troco</th><th>Retiradas</th><th>Fechamento</th><th>Diferença</th><th>Ações</th></tr></thead>
              <tbody>{data.operations.map((operation) => <tr key={operation.id}>
                <td>{formatDate(operation.openedAt)}</td>
                <td><span className={operation.status === "OPEN" ? "tag tag-open" : "tag tag-neutral"}>{operation.status === "OPEN" ? "ABERTO" : "FECHADO"}</span></td>
                <td>{operation.employeeName || "—"}</td>
                <td>{operation.openingFloat}</td>
                <td>{operation.withdrawalsTotal}</td>
                <td>{operation.closedAt ? formatDate(operation.closedAt) : "—"}</td>
                <td>{operation.differenceLabel || "—"}</td>
                <td><button className="button button-danger button-small" type="button" disabled={loading || clearing || deletingId !== null} onClick={() => void removeOperation(operation)}>{deletingId === operation.id ? "Removendo…" : "Remover"}</button></td>
              </tr>)}</tbody>
            </table>
          </div>

          <div className="cash-operations-cards">{data.operations.map((operation) => <article className="cash-operation-card" key={operation.id}>
            <div className="cash-operation-card-head">
              <div><strong>{formatDate(operation.openedAt)}</strong><div className="muted">{operation.employeeName || "Responsável não informado"}</div></div>
              <span className={operation.status === "OPEN" ? "tag tag-open" : "tag tag-neutral"}>{operation.status === "OPEN" ? "ABERTO" : "FECHADO"}</span>
            </div>
            <div className="cash-operation-card-grid">
              <div><span>Troco inicial</span><strong>{operation.openingFloat}</strong></div>
              <div><span>Retiradas</span><strong>{operation.withdrawalsTotal}</strong></div>
              <div><span>Vendas em dinheiro</span><strong>{operation.cashSales || "—"}</strong></div>
              <div><span>Vendas (Máquina)</span><strong>{operation.machineSales || "—"}</strong></div>
              <div><span>Dinheiro esperado</span><strong>{operation.expectedCash || "—"}</strong></div>
              <div><span>Dinheiro contado</span><strong>{operation.countedCash || "—"}</strong></div>
              <div><span>Diferença</span><strong>{operation.differenceLabel || "—"}</strong></div>
              {operation.closedAt && <div><span>Fechado em</span><strong>{formatDate(operation.closedAt)}</strong></div>}
            </div>
            <button className="button button-danger button-small" type="button" disabled={loading || clearing || deletingId !== null} onClick={() => void removeOperation(operation)}>{deletingId === operation.id ? "Removendo…" : "Remover operação"}</button>
          </article>)}</div>

          <div className="register-pagination cash-operations-pagination">
            <span className="muted">Página {data.page} de {data.totalPages} · {data.totalOperations} operações</span>
            <div className="register-actions">
              <button className="button button-secondary button-small" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
              <button className="button button-secondary button-small" type="button" disabled={page >= data.totalPages || loading} onClick={() => setPage((value) => Math.min(data.totalPages, value + 1))}>Próxima</button>
            </div>
          </div>
        </> : <div className="empty cash-operations-empty">Nenhuma operação registrada neste caixa.</div>}
      </>}
      <div className="register-modal-actions cash-operations-footer">
        <button className="button button-secondary" type="button" disabled={loading || clearing || deletingId !== null} onClick={onClose}>Fechar</button>
      </div>
    </section>
  </div>;
}
