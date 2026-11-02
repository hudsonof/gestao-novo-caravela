"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function DepositProofUpload({ depositId }: { depositId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
    if (!file) {
      setMessage("Selecione um comprovante.");
      return;
    }

    setBusy(true);
    setMessage("");
    let objectPath: string | undefined;
    const completeEndpoint = `/api/deposits/${depositId}/attachments/complete`;
    const completion = { fileName: file.name, contentType: file.type, sizeBytes: file.size };
    try {
      const signResponse = await fetch(`/api/deposits/${depositId}/attachments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(completion),
      });
      const signedUpload = await signResponse.json().catch(() => ({}));
      if (!signResponse.ok) throw new Error(signedUpload.error || "Não foi possível preparar o envio do comprovante.");
      objectPath = signedUpload.objectPath;

      const uploadResponse = await fetch(signedUpload.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type, "x-upsert": "false" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("O armazenamento recusou o arquivo. Confira o bucket privado e o limite de upload.");

      const response = await fetch(completeEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...completion, objectPath }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "O arquivo foi enviado, mas não foi possível registrar o comprovante.");
      setMessage("Comprovante anexado com segurança.");
      form.reset();
      router.refresh();
    } catch (error) {
      if (objectPath) {
        const retry = await fetch(completeEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...completion, objectPath }),
        }).catch(() => null);
        if (retry?.ok) {
          setMessage("Comprovante anexado com segurança.");
          form.reset();
          router.refresh();
          setBusy(false);
          return;
        }
        await fetch(`/api/deposits/${depositId}/attachments/cleanup`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ objectPath }),
        }).catch(() => undefined);
      }
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar o comprovante.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="proof-upload" onSubmit={submit}>
      <label>
        Anexar comprovante (PDF, JPG ou PNG; até 10 MB)
        <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required disabled={busy} />
      </label>
      <button className="button" type="submit" disabled={busy}>{busy ? "Enviando…" : "Anexar"}</button>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  );
}
