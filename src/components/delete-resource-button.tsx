"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteResourceButton({ endpoint, label, confirmMessage, disabled = false }: { endpoint: string; label: string; confirmMessage: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function remove() {
    if (disabled || !window.confirm(confirmMessage)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir.");
      setMessage("Excluído.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }
  return <span><button className="button button-danger button-small" type="button" disabled={disabled || busy} onClick={remove}>{busy ? "Aguarde…" : label}</button>{message && <small className="muted">{message}</small>}</span>;
}
