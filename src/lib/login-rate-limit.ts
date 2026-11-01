import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function isLoginBlocked(key: string) {
  const row = await prisma.loginAttempt.findUnique({ where: { key } });
  return !!row?.blockedUntil && row.blockedUntil > new Date();
}

export async function registerLoginFailure(key: string) {
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ key: string }>>`SELECT "key" FROM "LoginAttempt" WHERE "key" = ${key} FOR UPDATE`;
      const row = rows.length ? await tx.loginAttempt.findUnique({ where: { key } }) : null;
      const expired =
        !row ||
        row.windowStartedAt.getTime() <= now.getTime() - WINDOW_MS ||
        (!!row.blockedUntil && row.blockedUntil <= now);

      if (expired) {
        await tx.loginAttempt.upsert({
          where: { key },
          create: { key, attempts: 1, windowStartedAt: now },
          update: { attempts: 1, windowStartedAt: now, blockedUntil: null },
        });
        return;
      }

      const attempts = row.attempts + 1;
      await tx.loginAttempt.update({
        where: { key },
        data: {
          attempts,
          blockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MS) : null,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function clearLoginFailures(key: string) {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}
