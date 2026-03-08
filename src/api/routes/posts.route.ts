import { FastifyInstance } from "fastify";
import { createPostHandler, deletePostHandler, updatePostHandler } from "../controllers/posts.controller.js";

export async function postsRoutes(app: FastifyInstance) {
  app.post("/", createPostHandler);
  app.put("/:postId", updatePostHandler);
  app.delete("/:postId", deletePostHandler);
}