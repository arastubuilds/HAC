import { FastifyInstance } from "fastify";
import { queryHandler } from "../controllers/query.controller.js";
import { authenticate } from "../middleware/authenticate.middleware.js";

export async function queryRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: authenticate }, queryHandler);
}
