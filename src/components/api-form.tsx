"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type FormField = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number" | "date" | "datetime-local" | "select";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  step?: string;
  min?: string;
  options?: Array<{ value: string; label: string }>;
};

export function ApiForm({
  endpoint,
  title,
  fields,
  hidden,
  submitLabel = "Salvar",
  method = "POST",
}: {
  endpoint: string;
  title: string;
  fields: FormField[];
  hidden?: Record<string, string>;
  submitLabel?: string;
  method?: "POST" | "PATCH";
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = { ...(hidden || {}) };
    form.forEach((value, key) => { payload[key] = String(value); });
    for (const field of fields) {
      if (field.type === "datetime-local" && payload[field.name]) {
        payload[field.name] = new Date(payload[field.name]).toISOString();
      }
    }
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json", "x-idempotency-key": idempotencyKey.current },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
      setMessage("Operação registrada.");
      idempotencyKey.current = null;
      formElement.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card api-form" onSubmit={submit}>
      <h2>{title}</h2>
      {fields.map((field) => (
        <label key={field.name}>
          {field.label}
          {field.type === "select" ? (
            <select name={field.name} required={field.required !== false} defaultValue={field.defaultValue || ""}>
              {field.required === false && <option value="">—</option>}
              {(field.options || []).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          ) : (
            <input
              name={field.name}
              type={field.type || "text"}
              required={field.required !== false}
              placeholder={field.placeholder}
              defaultValue={field.defaultValue}
              step={field.step}
              min={field.min}
            />
          )}
        </label>
      ))}
      <button className="button" type="submit" disabled={busy}>{busy ? "Salvando…" : submitLabel}</button>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  );
}
