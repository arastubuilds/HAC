import { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.middleware.js";
import {
  listReviews,
  getReviewById,
  resolveThreadReview,
} from "../../services/threadReview.service.js";

const ListQuerySchema = z.object({
  status: z.string().optional(),
  importRunId: z.string().optional(),
  publishDecision: z.string().optional(),
});

const ResolveBodySchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().min(1),
});

export function adminReviewRoutes(app: FastifyInstance) {
  app.get(
    "/",
    { preHandler: authenticate },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = ListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid query params", details: z.treeifyError(parsed.error) });
      }
      const reviews = await listReviews(parsed.data);
      return reply.send(reviews);
    },
  );

  app.get(
    "/:id",
    { preHandler: authenticate },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const review = await getReviewById(id);
      if (!review) return reply.status(404).send({ error: "Not found" });
      return reply.send(review);
    },
  );

  app.patch(
    "/:id",
    { preHandler: authenticate },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const parsed = ResolveBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body", details: z.treeifyError(parsed.error) });
      }
      const existing = await getReviewById(id);
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await resolveThreadReview(id, parsed.data.decision, parsed.data.reason, req.user.sub);
      return reply.status(204).send();
    },
  );
}
