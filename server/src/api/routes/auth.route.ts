import type { FastifyInstance } from "fastify";
import { registerHandler, loginHandler, meHandler } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.middleware.js";

export function authRoutes(app: FastifyInstance): void {
  const authRateLimit = {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  };
  app.post("/register", authRateLimit, registerHandler);
  app.post("/login", authRateLimit, loginHandler);
  app.get("/me", { preHandler: authenticate }, meHandler);
}
