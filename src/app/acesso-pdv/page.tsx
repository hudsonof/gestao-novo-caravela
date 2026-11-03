import { logout } from "@/app/actions";

export default function PosOnlyAccessPage() {
  return <main className="login-shell">
    <section className="login-card">
      <div className="brand-login">NOVO CARAVELA</div>
      <h1>Acesso pelo PDV</h1>
      <p className="muted">Este perfil pode acessar as operações do PDV pelo aplicativo. Para acessar o sistema de gestão, use uma conta de gerente ou administrador.</p>
      <form action={logout}><button className="button" type="submit">Sair</button></form>
    </section>
  </main>;
}
