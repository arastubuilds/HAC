import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { RegisterDTO, LoginDTO, type AuthResponse } from "../dtos/auth.dto.js";
import { registerUser, verifyCredentials } from "../../services/auth.service.js";

export async function registerHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = RegisterDTO.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid request body", details: z.treeifyError(parsed.error) });
  }

  try {
    const user = await registerUser(parsed.data);
    const token = await reply.jwtSign(
      { sub: user.id, email: user.email },
      { expiresIn: "7d" },
    );
    const response: AuthResponse = {
      token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() },
    };
    return reply.status(201).send(response);
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_TAKEN") {
      return reply.status(409).send({ error: "Email already in use" });
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
    { sub: user.id, email: user.email },
    { expiresIn: "7d" },
  );
  const response: AuthResponse = {
    token,
    user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() },
  };
  return reply.status(200).send(response);
}
