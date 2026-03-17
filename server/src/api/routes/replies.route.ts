import { type FastifyInstance } from "fastify";
import { createReplyHandler, deleteReplyHandler, listRepliesHandler } from "../controllers/replies.controller.js";
import { authenticate } from "../middleware/authenticate.middleware.js";

export function repliesRoutes(app: FastifyInstance) {
  // Nested under /posts/:postId
  app.get("/posts/:postId/replies", listRepliesHandler);
  app.post("/posts/:postId/replies", { preHandler: authenticate }, createReplyHandler);
  // Standalone delete
  app.delete("/replies/:replyId", { preHandler: authenticate }, deleteReplyHandler);
}
