"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type UserRole = "ADMIN" | "MANAGER";
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  hasHistory: boolean;
};

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
};

export function UserManager({
  users,
  currentUserId,
  currentPage,
  totalPages,
  totalUsers,
}: {
  users: ManagedUser[];
  currentUserId: string;
  currentPage: number;
  totalPages: number;
  totalUsers: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ManagedUser | null>(null);
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

  function openEdit(user: ManagedUser) {
    setMessage("");
    setFormMessage("");
    setIsCreating(false);
    setEditing(user);
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload: Record<string, string> = {
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      role: String(data.get("role") || "MANAGER"),
    };
    const password = String(data.get("password") || "");
    if (password) payload.password = password;

    setSaving(true);
    setFormMessage("");
    try {
      const response = await fetch(editing ? `/api/admin/users/${editing.id}` : "/api/admin/users", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o usuário.");
      closeDialog();
      setMessage(editing ? "Usuário atualizado." : "Usuário cadastrado.");
      router.refresh();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Não foi possível salvar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function changeAvailability(user: ManagedUser) {
    const nextActive = !user.active;
    setBusyId(user.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}/active`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar a situação do usuário.");
      setMessage(nextActive ? "Usuário reativado." : "Usuário inativado.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível alterar a situação do usuário.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (user.id === currentUserId || user.hasHistory) return;
    if (!window.confirm(`Excluir o usuário “${user.name}” (${user.email})? Esta ação não pode ser desfeita.`)) return;
    setBusyId(user.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir o usuário.");
      setMessage("Usuário excluído.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o usuário.");
    } finally {
      setBusyId(null);
    }
  }

  function goToPage(page: number) {
    router.push(page === 1 ? "/usuarios" : `/usuarios?page=${page}`);
  }

  return <section className="section user-manager">
    <div className="register-toolbar">
      <div>
        <h2>Usuários</h2>
        <p className="muted">Usuários com registros vinculados devem ser inativados para preservar o histórico.</p>
      </div>
      <button className="button" type="button" onClick={openCreate}>Novo usuário</button>
    </div>

    {message && <p className="form-message register-message" role="status">{message}</p>}

    {users.length ? <>
      <div className="register-table-wrap">
        <table className="register-table">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{users.map((user) => {
            const busy = busyId === user.id;
            const isCurrentUser = user.id === currentUserId;
            return <tr key={user.id}>
              <td><strong>{user.name}</strong>{isCurrentUser && <div className="muted">Usuário atual</div>}</td>
              <td>{user.email}</td>
              <td>{roleLabels[user.role]}</td>
              <td><span className={user.active ? "tag" : "tag tag-neutral"}>{user.active ? "ATIVO" : "INATIVO"}</span></td>
              <td><div className="register-actions">
                <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => openEdit(user)}>Editar</button>
                <button className="button button-secondary button-small" type="button" disabled={busy || (isCurrentUser && user.active)} onClick={() => changeAvailability(user)}>{busy ? "Aguarde…" : user.active ? "Inativar" : "Ativar"}</button>
                <button className="button button-danger button-small" type="button" disabled={busy || isCurrentUser || user.hasHistory} title={isCurrentUser ? "Não é possível excluir o usuário atual." : user.hasHistory ? "Usuários com histórico devem ser inativados." : "Excluir usuário"} onClick={() => deleteUser(user)}>Excluir</button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="register-pagination">
        <span className="muted">{totalUsers} usuário(s) · página {currentPage} de {totalPages}</span>
        <div className="register-actions">
          <button className="button button-secondary button-small" type="button" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>Anterior</button>
          <button className="button button-secondary button-small" type="button" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>Próxima</button>
        </div>
      </div>
    </> : <div className="card empty">Nenhum usuário cadastrado.</div>}

    {dialogOpen && <div className="register-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeDialog(); }}>
      <section className="card register-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" onKeyDown={(event) => { if (event.key === "Escape" && !saving) closeDialog(); }}>
        <div className="register-modal-header">
          <h2 id="user-modal-title">{editing ? "Editar usuário" : "Novo usuário"}</h2>
          <button className="register-modal-close" type="button" aria-label="Fechar" disabled={saving} onClick={closeDialog}>×</button>
        </div>
        <form className="register-modal-form" onSubmit={saveUser}>
          <label>Nome<input name="name" required minLength={2} maxLength={120} defaultValue={editing?.name || ""} autoFocus /></label>
          <label>E-mail<input name="email" type="email" required maxLength={254} defaultValue={editing?.email || ""} /></label>
          <label>{editing ? "Nova senha (opcional)" : "Senha (mínimo 14 caracteres)"}<input name="password" type="password" required={!editing} minLength={14} maxLength={200} autoComplete="new-password" placeholder={editing ? "Deixe em branco para manter a senha atual" : undefined} /></label>
          <label>Perfil<select name="role" required defaultValue={editing?.role || "MANAGER"}>{(editing?.id === currentUserId ? [{ value: "ADMIN" as const, label: "Administrador" }] : [{ value: "MANAGER" as const, label: "Gerente" }, { value: "ADMIN" as const, label: "Administrador" }]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          {formMessage && <p className="notice error" role="alert">{formMessage}</p>}
          <div className="register-modal-actions">
            <button className="button button-secondary" type="button" disabled={saving} onClick={closeDialog}>Cancelar</button>
            <button className="button" type="submit" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar usuário"}</button>
          </div>
        </form>
      </section>
    </div>}
  </section>;
}
