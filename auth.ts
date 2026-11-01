import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "./src/lib/db";
import { clearLoginFailures, isLoginBlocked, registerLoginFailure } from "./src/lib/login-rate-limit";

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const forwardedFor = request.headers.get("x-forwarded-for");
        const ip = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
        const key = createHash("sha256").update(email + "|" + ip).digest("hex");

        if (await isLoginBlocked(key)) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        const validPassword = user?.passwordHash
          ? await bcrypt.compare(parsed.data.password, user.passwordHash)
          : false;

        if (!user || !user.active || !validPassword) {
          await registerLoginFailure(key);
          return null;
        }

        await clearLoginFailures(key);
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
      }
      if (token.sub) {
        const currentUser = await prisma.user.findUnique({ where: { id: token.sub }, select: { active: true, role: true } });
        if (!currentUser?.active) return { ...token, sub: "", role: undefined };
        token.role = currentUser.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "MANAGER";
      }
      return session;
    },
  },
});
