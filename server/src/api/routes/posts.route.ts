import { type FastifyInstance } from "fastify";
import { createPostHandler, deletePostHandler, getPostHandler, listPostsHandler, updatePostHandler } from "../controllers/posts.controller.js";
import { authenticate } from "../middleware/authenticate.middleware.js";

export function postsRoutes(app: FastifyInstance) {
  // Public
  app.get("/", listPostsHandler);
  app.get("/:postId", getPostHandler);
  // Protected
  app.post("/", { preHandler: authenticate }, createPostHandler);
  app.put("/:postId", { preHandler: authenticate }, updatePostHandler);
  app.delete("/:postId", { preHandler: authenticate }, deletePostHandler);
}
