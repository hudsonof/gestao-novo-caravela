"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Sector = "TICKETS" | "TABLES" | "BAR";

type CashRegister = {
  id: string;
  name: string;
  sector: Sector;
  active: boolean;
  totalSessions: number;
  openSessions: number;
};

const sectorNames: Record<Sector, string> = {
  TICKETS: "Bilheteria",
  TABLES: "Mesas",
  BAR: "Bar",
};

const sectorOptions: Array<{ value: Sector; label: string }> = [
  { value: "TICKETS", label: "Bilheteria" },
  { value: "TABLES", label: "Mesas" },
  { value: "BAR", label: "Bar" },
];

export function CashRegisterManager({
  registers,
  currentPage,
  totalPages,
  totalRegisters,
}: {
  registers: CashRegister[];
  currentPage: number;
  totalPages: number;
  totalRegisters: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CashRegister | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const dialogOpen = isCreating || editing !== null;

  function closeDialog() {
    setIsCreating(false);
    setEditing(null);
    setFormMessage("");
  }

  function openCreate() {
    setMessage("");
    setFormMessage("");
    setEditing(null);
    setIsCreating(true);
  }

  function openEdit(register: CashRegister) {
    if (register.totalSessions > 0) return;
    setMessage("");
    setFormMessage("");
    setIsCreating(false);
    setEditing(register);
  }

  async function saveRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setFormMessage("");
    try {
      const response = await fetch(editing ? `/api/registers/${editing.id}` : "/api/registers", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), sector: data.get("sector") }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o caixa.");
      closeDialog();
      setMessage(editing ? "Caixa atualizado." : "Caixa cadastrado.");
      router.refresh();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Não foi possível salvar o caixa.");
    } finally {
      setSaving(false);
    }
  }

  async function changeAvailability(register: CashRegister) {
    const nextActive = !register.active;
    setBusyId(register.id);
    setMessage("");
    try {
      const response = await fetch(`/api/registers/${register.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar a situação do caixa.");
      setMessage(nextActive ? "Caixa reativado." : "Caixa inativado.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível alterar a situação do caixa.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRegister(register: CashRegister) {
    if (register.totalSessions > 0 || !window.confirm(`Excluir o caixa “${register.name}”? Esta ação não pode ser desfeita.`)) return;
    setBusyId(register.id);
    setMessage("");
    try {
      const response = await fetch(`/api/registers/${register.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir o caixa.");
      setMessage("Caixa excluído.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o caixa.");
    } finally {
      setBusyId(null);
    }
  }

  function goToPage(page: number) {
    router.push(page === 1 ? "/caixas" : `/caixas?page=${page}`);
  }

  return <section className="section register-manager">
    <div className="register-toolbar">
      <div>
        <h2>Cadastro de caixas</h2>
        <p className="muted">Caixas com sessões registradas preservam o histórico; você pode inativá-los em vez de excluí-los.</p>
      </div>
      <button className="button" type="button" onClick={openCreate}>Novo caixa</button>
    </div>

    {message && <p className="form-message register-message" role="status">{message}</p>}

    {registers.length ? <>
      <div className="register-table-wrap">
        <table className="register-table">
          <thead><tr><th>Caixa</th><th>Setor</th><th>Sessões</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{registers.map((register) => {
            const busy = busyId === register.id;
            const hasHistory = register.totalSessions > 0;
            return <tr key={register.id}>
              <td><strong>{register.name}</strong></td>
              <td>{sectorNames[register.sector]}</td>
              <td>{register.totalSessions} {register.totalSessions === 1 ? "sessão" : "sessões"}{register.openSessions > 0 && <span className="muted"> · {register.openSessions} aberta(s)</span>}</td>
              <td><span className={register.active ? "tag" : "tag tag-neutral"}>{register.active ? "ATIVO" : "INATIVO"}</span></td>
              <td><div className="register-actions">
                <button className="button button-secondary button-small" type="button" disabled={busy || hasHistory} title={hasHistory ? "Nome e setor ficam fixos depois da primeira sessão." : "Editar caixa"} onClick={() => openEdit(register)}>Editar</button>
                <button className="button button-secondary button-small" type="button" disabled={busy || (register.active && register.openSessions > 0)} title={register.active && register.openSessions > 0 ? "Feche as sessões abertas antes de inativar." : undefined} onClick={() => changeAvailability(register)}>{busy ? "Aguarde…" : register.active ? "Inativar" : "Ativar"}</button>
                <button className="button button-danger button-small" type="button" disabled={busy || hasHistory} title={hasHistory ? "Caixas com sessões não podem ser excluídos." : "Excluir caixa"} onClick={() => deleteRegister(register)}>Excluir</button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="register-pagination">
        <span className="muted">{totalRegisters} caixa(s) · página {currentPage} de {totalPages}</span>
        <div className="register-actions">
          <button className="button button-secondary button-small" type="button" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>Anterior</button>
          <button className="button button-secondary button-small" type="button" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>Próxima</button>
        </div>
      </div>
    </> : <div className="card empty">Nenhum caixa cadastrado.</div>}

    {dialogOpen && <div className="register-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeDialog(); }}>
      <section className="card register-modal" role="dialog" aria-modal="true" aria-labelledby="register-modal-title" onKeyDown={(event) => { if (event.key === "Escape" && !saving) closeDialog(); }}>
        <div className="register-modal-header">
          <h2 id="register-modal-title">{editing ? "Editar caixa" : "Novo caixa"}</h2>
          <button className="register-modal-close" type="button" aria-label="Fechar" disabled={saving} onClick={closeDialog}>×</button>
        </div>
        <form className="register-modal-form" onSubmit={saveRegister}>
          <label>Nome do caixa<input name="name" required minLength={2} maxLength={80} defaultValue={editing?.name || ""} autoFocus /></label>
          <label>Setor<select name="sector" required defaultValue={editing?.sector || "TICKETS"}>{sectorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          {formMessage && <p className="notice error" role="alert">{formMessage}</p>}
          <div className="register-modal-actions">
            <button className="button button-secondary" type="button" disabled={saving} onClick={closeDialog}>Cancelar</button>
            <button className="button" type="submit" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar caixa"}</button>
          </div>
        </form>
      </section>
    </div>}
  </section>;
}
