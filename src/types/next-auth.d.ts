import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      posCashRegisterId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    posCashRegisterId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    posCashRegisterId?: string | null;
  }
}
