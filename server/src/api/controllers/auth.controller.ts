import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { RegisterDTO, LoginDTO, type AuthResponse } from "../dtos/auth.dto.js";
import { registerUser, verifyCredentials } from "../../services/auth.service.js";
import { prisma } from "../../infra/prisma.js";

export async function registerHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = RegisterDTO.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid request body", details: z.treeifyError(parsed.error) });
  }

  try {
    const user = await registerUser({
      email: parsed.data.email,
      username: parsed.data.username,
      password: parsed.data.password,
      ...(parsed.data.firstName !== undefined && { firstName: parsed.data.firstName }),
      ...(parsed.data.lastName !== undefined && { lastName: parsed.data.lastName }),
    });
    const token = await reply.jwtSign(
      { sub: user.id, username: user.username },
      { expiresIn: "7d" },
    );
    const response: AuthResponse = {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt.toISOString(),
      },
    };
    return await reply.status(201).send(response);
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_TAKEN") {
      return reply.status(409).send({ error: "Email already in use" });
    }
    if (err instanceof Error && err.message === "USERNAME_TAKEN") {
      return reply.status(409).send({ error: "Username already taken" });
    }
    throw err;
  }
}

export async function loginHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = LoginDTO.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid request body", details: z.treeifyError(parsed.error) });
  }

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    return reply.status(401).send({ error: "Invalid credentials" });
  }

  const token = await reply.jwtSign(
    { sub: user.id, username: user.username },
    { expiresIn: "7d" },
  );
  const response: AuthResponse = {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt.toISOString(),
    },
  };
  return reply.status(200).send(response);
}

export async function meHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, email: true, username: true, firstName: true, lastName: true, createdAt: true },
  });
  if (!user) return reply.status(404).send({ error: "User not found" });
  return reply.status(200).send({
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    createdAt: user.createdAt.toISOString(),
  });
}
