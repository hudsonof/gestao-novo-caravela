"use client";

import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
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

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function digitsFromValue(value: string) {
  return value.replace(/\D/g, "");
}

function decimalFromCurrencyInput(value: string) {
  const digits = digitsFromValue(value);
  if (!digits) return "";

  const padded = digits.padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  return `${whole}.${padded.slice(-2)}`;
}

function formatCurrencyInput(value: string) {
  if (!value) return "";
  const decimal = decimalFromCurrencyInput(value);
  return decimal ? brlFormatter.format(Number(decimal)) : "";
}

function centsFromDecimal(value: string) {
  const digits = digitsFromValue(value);
  return BigInt(digits || "0");
}

function handleCurrencyChange(event: ChangeEvent<HTMLInputElement>) {
  const digits = digitsFromValue(event.currentTarget.value);
  event.currentTarget.value = formatCurrencyInput(digits);
}

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
      if (field.type === "number") {
        const decimalValue = decimalFromCurrencyInput(payload[field.name] || "");
        if (decimalValue && field.min && centsFromDecimal(decimalValue) < centsFromDecimal(field.min)) {
          setMessage(`${field.label} deve ser no mínimo ${brlFormatter.format(Number(field.min))}.`);
          setBusy(false);
          return;
        }
        payload[field.name] = decimalValue;
      }
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
              type={field.type === "number" ? "text" : field.type || "text"}
              inputMode={field.type === "number" ? "decimal" : undefined}
              autoComplete={field.type === "number" ? "off" : undefined}
              required={field.required !== false}
              placeholder={field.type === "number" ? "R$ 0,00" : field.placeholder}
              defaultValue={field.type === "number" ? formatCurrencyInput(field.defaultValue || "") : field.defaultValue}
              onChange={field.type === "number" ? handleCurrencyChange : undefined}
            />
          )}
        </label>
      ))}
      <button className="button" type="submit" disabled={busy}>{busy ? "Salvando…" : submitLabel}</button>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  );
}
