"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiForm } from "@/components/api-form";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  active: boolean;
  hasHistory: boolean;
  openShifts: number;
};

export function EmployeeManager({
  employees,
  currentPage,
  totalPages,
  totalEmployees,
}: {
  employees: Employee[];
  currentPage: number;
  totalPages: number;
  totalEmployees: number;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"CREATE" | "EDIT" | null>(null);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function openCreate() {
    setMessage("");
    setSelected(null);
    setDialog("CREATE");
  }

  function openEdit(employee: Employee) {
    setMessage("");
    setSelected(employee);
    setDialog("EDIT");
  }

  function closeDialog() {
    setDialog(null);
    setSelected(null);
  }

  async function changeAvailability(employee: Employee) {
    const nextActive = !employee.active;
    setBusyId(employee.id);
    setMessage("");
    try {
      const response = await fetch("/api/employees/" + employee.id + "/active", {
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
    if (employee.hasHistory || !window.confirm("Excluir o colaborador “" + employee.name + "”? Esta ação não pode ser desfeita.")) return;
    setBusyId(employee.id);
    setMessage("");
    try {
      const response = await fetch("/api/employees/" + employee.id, { method: "DELETE" });
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
    router.push(page === 1 ? "/equipe" : "/equipe?page=" + page);
  }

  return <section className="section register-manager">
    <div className="register-toolbar">
      <div><h2>Equipe cadastrada</h2><p className="muted">Registros com operações ou pagamentos vinculados podem ser inativados para manter o histórico.</p></div>
      <button className="button" type="button" onClick={openCreate}>Novo colaborador</button>
    </div>

    {message && <p className="form-message register-message" role="status">{message}</p>}
    {employees.length ? <>
      <div className="register-table-wrap">
        <table className="register-table">
          <thead><tr><th>Nome</th><th>Função</th><th>Situação</th><th>Operações abertas</th><th>Ações</th></tr></thead>
          <tbody>{employees.map((employee) => {
            const busy = busyId === employee.id;
            return <tr key={employee.id}>
              <td><strong>{employee.name}</strong></td>
              <td>{employee.position || "—"}</td>
              <td><span className={employee.active ? "tag" : "tag tag-neutral"}>{employee.active ? "ATIVO" : "INATIVO"}</span></td>
              <td>{employee.openShifts}</td>
              <td><div className="register-actions">
                <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => openEdit(employee)}>Editar</button>
                <button className="button button-secondary button-small" type="button" disabled={busy || (!employee.active && employee.openShifts > 0)} onClick={() => changeAvailability(employee)}>{busy ? "Aguarde…" : employee.active ? "Inativar" : "Ativar"}</button>
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

    {dialog && <div className="register-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section className="card register-modal employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title" onKeyDown={(event) => { if (event.key === "Escape") closeDialog(); }}>
        <div className="register-modal-header">
          <h2 id="employee-modal-title">{dialog === "EDIT" ? "Editar colaborador" : "Novo colaborador"}</h2>
          <button className="register-modal-close" type="button" aria-label="Fechar" onClick={closeDialog}>×</button>
        </div>
        {dialog === "CREATE" ? <ApiForm endpoint="/api/employees" title="Cadastro do colaborador" onSuccess={closeDialog} fields={[
          { name: "name", label: "Nome" },
          { name: "position", label: "Função", required: false },
        ]} submitLabel="Cadastrar colaborador" /> : selected && <ApiForm endpoint={"/api/employees/" + selected.id} method="PATCH" title="Dados do colaborador" onSuccess={closeDialog} fields={[
          { name: "name", label: "Nome", defaultValue: selected.name },
          { name: "position", label: "Função", required: false, defaultValue: selected.position || "" },
        ]} submitLabel="Salvar alterações" />}
      </section>
    </div>}
  </section>;
}
