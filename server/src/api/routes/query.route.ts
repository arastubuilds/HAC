import { type FastifyInstance } from "fastify";
import { queryHandler } from "../controllers/query.controller.js";
import { authenticate } from "../middleware/authenticate.middleware.js";

export function queryRoutes(app: FastifyInstance) {
  app.post("/", {
    preHandler: authenticate,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, queryHandler);
}
