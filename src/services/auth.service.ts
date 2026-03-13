import bcrypt from "bcryptjs";
import { prisma } from "../infra/prisma.js";
import type { User } from "../domain/users.js";
import type { CreateUserInput } from "../domain/users.js";

export async function registerUser(input: CreateUserInput): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new Error("EMAIL_TAKEN");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash },
  });
  return user;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return user;
}
