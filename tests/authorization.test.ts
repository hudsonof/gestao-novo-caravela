import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock("../auth", () => ({ auth: mocks.auth }));
vi.mock("../src/lib/db", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));

import { requireAdmin, requireManager } from "../src/lib/authorization";

describe("autorização financeira", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.findUser.mockReset();
  });

  it("recusa chamadas sem sessão autenticada", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(requireManager()).rejects.toMatchObject({ status: 401 });
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("permite gerente nas operações financeiras e impede acesso administrativo", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "manager-1" } });
    mocks.findUser.mockResolvedValue({ id: "manager-1", name: "Gerente", role: "MANAGER", active: true });

    await expect(requireManager()).resolves.toMatchObject({ userId: "manager-1", role: "MANAGER" });
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });

  it("recusa usuário desativado mesmo que a sessão ainda exista", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "inactive-1" } });
    mocks.findUser.mockResolvedValue({ id: "inactive-1", name: "Inativo", role: "ADMIN", active: false });

    await expect(requireManager()).rejects.toMatchObject({ status: 401 });
  });
});
