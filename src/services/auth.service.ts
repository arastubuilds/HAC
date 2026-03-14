import bcrypt from "bcryptjs";
import { prisma } from "../infra/prisma.js";
import type { User, CreateUserInput } from "../domain/users.js";

import { Prisma } from "@prisma/client";

export async function registerUser(input: CreateUserInput): Promise<User> {
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          username: input.username,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
        },
      });

      await tx.account.create({
        data: {
          userId: created.id,
          provider: "local",
          providerAccountId: created.id,
          passwordHash,
        },
      });

      return created;
    });

    return user;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("EMAIL_OR_USERNAME_TAKEN", {cause: error});
    }
    throw error;
  }
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<User | null> {
  const userWithAccounts = await prisma.user.findUnique({
    where: { email },
    include: { accounts: { where: { provider: "local" } } },
  });

  if (!userWithAccounts) return null;

  const account = userWithAccounts.accounts[0];
  if (!account?.passwordHash) return null;

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) return null;

  const { ...user } = userWithAccounts;
  return user;
}
