import type { FastifyInstance } from "fastify";
import { registerHandler, loginHandler } from "../controllers/auth.controller.js";

export function authRoutes(app: FastifyInstance): void {
  app.post("/register", registerHandler);
  app.post("/login", loginHandler);
}
