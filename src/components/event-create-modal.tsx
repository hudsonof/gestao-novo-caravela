"use client";

import { useState } from "react";
import { ApiForm, type FormField } from "@/components/api-form";

const fields: FormField[] = [
  { name: "name", label: "Nome do evento" },
  { name: "startsAt", label: "Início", type: "datetime-local" },
  { name: "endsAt", label: "Término (opcional)", type: "datetime-local", required: false },
  { name: "responsibleName", label: "Responsável", required: false },
  { name: "notes", label: "Observações", required: false },
];

export function EventCreateModal() {
  const [open, setOpen] = useState(false);

  function closeModal() {
    setOpen(false);
  }

  return (
    <>
      <button className="button" type="button" onClick={() => setOpen(true)}>
        Novo evento
      </button>

      {open && (
        <div
          className="register-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="card register-modal employee-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-modal-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeModal();
            }}
          >
            <div className="register-modal-header">
              <h2 id="event-modal-title">Novo evento</h2>
              <button className="register-modal-close" type="button" aria-label="Fechar" onClick={closeModal}>
                ×
              </button>
            </div>
            <ApiForm
              endpoint="/api/events"
              title="Novo evento"
              fields={fields}
              submitLabel="Cadastrar evento"
              onSuccess={closeModal}
            />
          </section>
        </div>
      )}
    </>
  );
}
