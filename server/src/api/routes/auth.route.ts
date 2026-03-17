import type { FastifyInstance } from "fastify";
import { registerHandler, loginHandler } from "../controllers/auth.controller.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/register", registerHandler);
  app.post("/login", loginHandler);
}
