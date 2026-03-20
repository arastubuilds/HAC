import type { FastifyInstance } from "fastify";
import { registerHandler, loginHandler, meHandler } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.middleware.js";

export function authRoutes(app: FastifyInstance): void {
  app.post("/register", registerHandler);
  app.post("/login", loginHandler);
  app.get("/me", { preHandler: authenticate }, meHandler);
}
