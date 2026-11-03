import type { PosChannel, Sector, UserRole } from "@prisma/client";

const channels = {
  POS_TICKETS: "TICKETS",
  POS_TABLES: "TABLES",
  POS_BAR: "BAR",
  POS_WAITER: "WAITER",
} as const satisfies Partial<Record<UserRole, PosChannel>>;

const sectors = {
  POS_TICKETS: "TICKETS",
  POS_TABLES: "TABLES",
  POS_BAR: "BAR",
  POS_WAITER: "BAR",
} as const satisfies Partial<Record<UserRole, Sector>>;

export function posChannelForRole(role: UserRole): PosChannel | null {
  return role in channels ? channels[role as keyof typeof channels] : null;
}

export function posSectorForRole(role: UserRole): Sector | null {
  return role in sectors ? sectors[role as keyof typeof sectors] : null;
}
