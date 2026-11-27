"use client";

import { useState } from "react";
import { ApiForm } from "@/components/api-form";

type Option = { value: string; label: string };

export function CashRegisterOpening({ registers, employees }: { registers: Option[]; employees: Option[] }) {
  const [open, setOpen] = useState(false);

  return <>
    <button className="button" type="button" onClick={() => setOpen(true)}>Abrir caixa</button>
    {open && <div className="register-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="card register-modal cash-opening-modal" role="dialog" aria-modal="true" aria-labelledby="open-register-title" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
        <div className="register-modal-header">
          <div>
            <h2 id="open-register-title">Abrir caixa</h2>
            <p className="muted cash-modal-subtitle">Conte e informe o troco antes de iniciar a operação.</p>
          </div>
          <button className="register-modal-close" type="button" aria-label="Fechar" onClick={() => setOpen(false)}>×</button>
        </div>
        <ApiForm endpoint="/api/register-shifts" title="Dados da abertura" onSuccess={() => setOpen(false)} fields={[
          { name: "registerId", label: "Caixa", type: "select", options: registers },
          { name: "employeeId", label: "Colaborador responsável (opcional)", type: "select", required: false, options: employees },
          { name: "openingFloat", label: "Troco inicial contado", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
        ]} submitLabel="Confirmar abertura" />
      </section>
    </div>}
  </>;
}
