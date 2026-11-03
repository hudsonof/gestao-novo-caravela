import type { DefaultSession } from "next-auth";

type AppRole = "ADMIN" | "MANAGER" | "POS_TICKETS" | "POS_TABLES" | "POS_BAR" | "POS_WAITER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      posCashRegisterId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: AppRole;
    posCashRegisterId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppRole;
    posCashRegisterId?: string | null;
  }
}
