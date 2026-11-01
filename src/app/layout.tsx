import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Novo Caravela | Gestão Financeira",
  description: "Gestão financeira do salão de eventos Novo Caravela",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
