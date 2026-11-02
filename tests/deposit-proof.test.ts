import { describe, expect, it } from "vitest";
import { MAX_DEPOSIT_PROOF_BYTES, validateDepositProof } from "../src/server/deposit-proof";

describe("comprovantes de depósito", () => {
  it("aceita PDF com assinatura e gera hash SHA-256", () => {
    const result = validateDepositProof({
      fileName: "comprovante.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
    });

    expect(result.contentType).toBe("application/pdf");
    expect(result.extension).toBe("pdf");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejeita extensão ou tipo que não corresponde ao conteúdo", () => {
    expect(() => validateDepositProof({
      fileName: "imagem.png",
      contentType: "image/png",
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
    })).toThrow("Envie um comprovante PDF, JPG ou PNG válido.");
  });

  it("rejeita arquivos vazios e acima de 10 MB", () => {
    expect(() => validateDepositProof({ fileName: "vazio.pdf", contentType: "application/pdf", bytes: new Uint8Array() })).toThrow("O arquivo está vazio.");
    expect(() => validateDepositProof({
      fileName: "grande.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array(MAX_DEPOSIT_PROOF_BYTES + 1),
    })).toThrow("O comprovante deve ter no máximo 10 MB.");
  });
});
