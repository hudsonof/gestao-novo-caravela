import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const params = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-login">NOVO CARAVELA</div>
        <h1>Acesso ao financeiro</h1>
        <p className="muted">Entre com seu usuário de administrador ou gerente.</p>
        {params.error && <div className="notice error">E-mail ou senha inválidos.</div>}
        <form action={login} className="stack-form">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
          <label htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} />
          <button className="button" type="submit">Entrar</button>
        </form>
      </section>
    </main>
  );
}
