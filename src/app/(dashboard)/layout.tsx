import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") redirect("/acesso-pdv");

  return (
    <DashboardShell userName={session.user.name ?? null} role={session.user.role}>
      {children}
    </DashboardShell>
  );
}
