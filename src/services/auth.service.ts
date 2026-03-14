import bcrypt from "bcryptjs";
import { prisma } from "../infra/prisma.js";
import type { User, CreateUserInput } from "../domain/users.js";

export async function registerUser(input: CreateUserInput): Promise<User> {
  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email } }),
    prisma.user.findUnique({ where: { username: input.username } }),
  ]);

  if (existingEmail) throw new Error("EMAIL_TAKEN");
  if (existingUsername) throw new Error("USERNAME_TAKEN");

  const passwordHash = await bcrypt.hash(input.password, 12);

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
