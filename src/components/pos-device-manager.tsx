"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Profile = "TICKETS" | "TABLES" | "BAR" | "WAITER";
type Device = { id: string; name: string; profile: Profile; cashRegisterId: string; active: boolean; cashRegister: { name: string } };
type Option = { value: string; label: string };

const profileLabels: Record<Profile, string> = { TICKETS: "Bilheteria", TABLES: "Mesas", BAR: "Bar", WAITER: "Garçons" };

export function PosDeviceManager({ devices, registers }: { devices: Device[]; registers: Option[] }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function createDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setCreating(true);
    setMessage("");
    setToken("");
    try {
      const response = await fetch("/api/pos/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: data.get("name"), profile: data.get("profile"), cashRegisterId: data.get("cashRegisterId") }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível cadastrar o terminal.");
      setToken(result.token);
      setMessage("Terminal cadastrado. Copie a credencial agora; ela não será exibida novamente.");
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível cadastrar o terminal.");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(device: Device) {
    setBusyId(device.id);
    setMessage("");
    try {
      const response = await fetch(`/api/pos/devices/${device.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !device.active }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar o terminal.");
      setMessage(device.active ? "Credencial revogada." : "Terminal reativado.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível alterar o terminal.");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="section card">
    <h2>Terminais do PDV</h2>
    <p className="muted">Cada terminal fica vinculado a um perfil e caixa. A credencial é exibida uma única vez no cadastro.</p>
    <form className="form-grid" onSubmit={createDevice}>
      <label>Nome do terminal<input name="name" required minLength={2} maxLength={100} /></label>
      <label>Perfil<select name="profile" required defaultValue="TICKETS">{Object.entries(profileLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Caixa vinculado<select name="cashRegisterId" required defaultValue="">{registers.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <button className="button" type="submit" disabled={creating || !registers.length}>{creating ? "Cadastrando…" : "Cadastrar terminal"}</button>
    </form>
    {message && <p className="form-message" role="status">{message}</p>}
    {token && <div className="notice"><strong>Credencial do terminal</strong><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{token}</pre></div>}
    {devices.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Terminal</th><th>Perfil</th><th>Caixa</th><th>Status</th><th>Ação</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td>{device.name}</td><td>{profileLabels[device.profile]}</td><td>{device.cashRegister.name}</td><td>{device.active ? "Ativo" : "Revogado"}</td><td><button className="button button-secondary button-small" type="button" disabled={busyId===device.id} onClick={() => toggle(device)}>{busyId===device.id ? "Aguarde…" : device.active ? "Revogar" : "Reativar"}</button></td></tr>)}</tbody></table></div> : <p className="empty">Nenhum terminal cadastrado.</p>}
  </section>;
}
