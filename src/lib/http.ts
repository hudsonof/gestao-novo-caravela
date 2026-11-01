import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Dados inválidos.", details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
      { status: 400 },
    );
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    return Response.json({ error: "Conflito de gravação. Reenvie a operação com a mesma chave de idempotência." }, { status: 409 });
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
    return Response.json({ error: "Registro não encontrado." }, { status: 404 });
  }
  console.error("API operation failed", error);
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}

export async function handleApi<T>(operation: () => Promise<T>, status = 200) {
  try {
    return Response.json(await operation(), { status });
  } catch (error) {
    return jsonError(error);
  }
}
