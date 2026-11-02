"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiForm } from "@/components/api-form";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  active: boolean;
  hasHistory: boolean;
  openSessions: number;
};

type Dialog =
  | { kind: "CREATE" }
  | { kind: "EDIT"; employee: Employee }
  | { kind: "COMPENSATION" }
  | { kind: "PAYMENT" }
  | null;

type Option = { value: string; label: string };

export function EmployeeManager({
  employees,
  activeEmployeeOptions,
  eventOptions,
  pendingCompensationOptions,
  payingAccountOptions,
  currentPage,
  totalPages,
  totalEmployees,
}: {
  employees: Employee[];
  activeEmployeeOptions: Option[];
  eventOptions: Option[];
  pendingCompensationOptions: Option[];
  payingAccountOptions: Option[];
  currentPage: number;
  totalPages: number;
  totalEmployees: number;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function closeDialog() {
    setDialog(null);
  }

  async function changeAvailability(employee: Employee) {
    const nextActive = !employee.active;
    setBusyId(employee.id);
    setMessage("");
    try {
      const response = await fetch(`/api/employees/${employee.id}/active`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar a situação do colaborador.");
      setMessage(nextActive ? "Colaborador reativado." : "Colaborador inativado.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível alterar a situação do colaborador.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteEmployee(employee: Employee) {
    if (employee.hasHistory || !window.confirm(`Excluir o colaborador “${employee.name}”? Esta ação não pode ser desfeita.`)) return;
    setBusyId(employee.id);
    setMessage("");
    try {
      const response = await fetch(`/api/employees/${employee.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir o colaborador.");
      setMessage("Colaborador excluído.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o colaborador.");
    } finally {
      setBusyId(null);
    }
  }

  function goToPage(page: number) {
    router.push(page === 1 ? "/equipe" : `/equipe?page=${page}`);
  }

  let dialogTitle = "";
  let dialogContent: ReactNode = null;

  if (dialog?.kind === "CREATE") {
    dialogTitle = "Novo colaborador";
    dialogContent = <ApiForm endpoint="/api/employees" title={dialogTitle} onSuccess={closeDialog} fields={[
      { name: "name", label: "Nome" },
      { name: "position", label: "Função", required: false },
    ]} submitLabel="Cadastrar colaborador" />;
  } else if (dialog?.kind === "EDIT") {
    dialogTitle = "Editar colaborador";
    dialogContent = <ApiForm endpoint={`/api/employees/${dialog.employee.id}`} method="PATCH" title={dialogTitle} onSuccess={closeDialog} fields={[
      { name: "name", label: "Nome", defaultValue: dialog.employee.name },
      { name: "position", label: "Função", required: false, defaultValue: dialog.employee.position || "" },
    ]} submitLabel="Salvar alterações" />;
  } else if (dialog?.kind === "COMPENSATION") {
    dialogTitle = "Lançar diária ou cachê";
    dialogContent = <ApiForm endpoint="/api/employee-compensations" title={dialogTitle} onSuccess={closeDialog} fields={[
      { name: "employeeId", label: "Colaborador", type: "select", options: activeEmployeeOptions },
      { name: "type", label: "Tipo", type: "select", options: [{ value: "DAILY", label: "Diária" }, { value: "CACHE", label: "Cachê" }] },
      { name: "description", label: "Descrição" },
      { name: "eventId", label: "Evento (opcional)", type: "select", required: false, options: eventOptions },
      { name: "amount", label: "Valor combinado", type: "number", min: "0.01", step: "0.01" },
      { name: "dueDate", label: "Data prevista para pagamento", type: "date" },
    ]} submitLabel="Registrar valor devido" />;
  } else if (dialog?.kind === "PAYMENT") {
    dialogTitle = "Pagar diária ou cachê";
    dialogContent = <ApiForm endpoint="/api/employee-payments" title={dialogTitle} onSuccess={closeDialog} fields={[
      { name: "compensationId", label: "Valor pendente", type: "select", options: pendingCompensationOptions },
      { name: "amount", label: "Valor pago", type: "number", min: "0.01", step: "0.01" },
      { name: "sourceAccountId", label: "Conta de origem", type: "select", options: payingAccountOptions },
      { name: "method", label: "Meio de pagamento", type: "select", options: [
        { value: "CASH", label: "Dinheiro" },
        { value: "PIX", label: "Pix" },
        { value: "BANK_TRANSFER", label: "Transferência bancária" },
        { value: "DEBIT", label: "Débito" },
        { value: "CREDIT", label: "Crédito" },
      ] },
      { name: "description", label: "Observação", required: false },
    ]} submitLabel="Registrar pagamento" />;
  }

  return <>
    <section className="section employee-manager">
      <div className="register-toolbar">
        <div>
          <h2>Equipe cadastrada</h2>
          <p className="muted">Colaboradores com sessões ou lançamentos associados não podem ser excluídos; você pode inativá-los.</p>
        </div>
        <div className="employee-toolbar-actions">
          <button className="button" type="button" onClick={() => { setMessage(""); setDialog({ kind: "CREATE" }); }}>Novo colaborador</button>
          <button className="button button-secondary" type="button" disabled={!activeEmployeeOptions.length} onClick={() => { setMessage(""); setDialog({ kind: "COMPENSATION" }); }}>Lançar diária</button>
          <button className="button button-secondary" type="button" disabled={!pendingCompensationOptions.length || !payingAccountOptions.length} onClick={() => { setMessage(""); setDialog({ kind: "PAYMENT" }); }}>Pagar diária</button>
        </div>
      </div>

      {message && <p className="form-message register-message" role="status">{message}</p>}

      {employees.length ? <>
        <div className="register-table-wrap">
          <table className="register-table">
            <thead><tr><th>Colaborador</th><th>Função</th><th>Histórico</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>{employees.map((employee) => {
              const busy = busyId === employee.id;
              return <tr key={employee.id}>
                <td><strong>{employee.name}</strong></td>
                <td>{employee.position || "—"}</td>
                <td>{employee.hasHistory ? "Possui registros" : "Sem registros"}{employee.openSessions > 0 && <div className="muted">{employee.openSessions} sessão(ões) aberta(s)</div>}</td>
                <td><span className={employee.active ? "tag" : "tag tag-neutral"}>{employee.active ? "ATIVO" : "INATIVO"}</span></td>
                <td><div className="register-actions">
                  <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => { setMessage(""); setDialog({ kind: "EDIT", employee }); }}>Editar</button>
                  <button className="button button-secondary button-small" type="button" disabled={busy || (employee.active && employee.openSessions > 0)} title={employee.active && employee.openSessions > 0 ? "Feche as sessões abertas antes de inativar." : undefined} onClick={() => changeAvailability(employee)}>{busy ? "Aguarde…" : employee.active ? "Inativar" : "Reativar"}</button>
                  <button className="button button-danger button-small" type="button" disabled={busy || employee.hasHistory} title={employee.hasHistory ? "Colaboradores com histórico não podem ser excluídos." : "Excluir colaborador"} onClick={() => deleteEmployee(employee)}>Excluir</button>
                </div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="register-pagination">
          <span className="muted">{totalEmployees} colaborador(es) · página {currentPage} de {totalPages}</span>
          <div className="register-actions">
            <button className="button button-secondary button-small" type="button" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>Anterior</button>
            <button className="button button-secondary button-small" type="button" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>Próxima</button>
          </div>
        </div>
      </> : <div className="card empty">Nenhum colaborador cadastrado.</div>}
    </section>

    {dialog && <div className="register-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section className="card register-modal employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title" onKeyDown={(event) => { if (event.key === "Escape") closeDialog(); }}>
        <div className="register-modal-header">
          <h2 id="employee-modal-title">{dialogTitle}</h2>
          <button className="register-modal-close" type="button" aria-label="Fechar" onClick={closeDialog}>×</button>
        </div>
        {dialogContent}
      </section>
    </div>}
  </>;
}
