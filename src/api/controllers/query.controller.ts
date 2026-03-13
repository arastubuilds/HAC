import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { QueryRequestDTO, QueryResponse } from "../dtos/query.dto.js";
import { cancerSupportAgent } from "../../ai/agents/query_support/graph.js";

export async function queryHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = QueryRequestDTO.safeParse(req.body);

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid request body",
      details: z.treeifyError(parsed.error),
    });
  }

  const result = await cancerSupportAgent.invoke({
    messages: [new HumanMessage(parsed.data.message)],
  });

  const response: QueryResponse = {
    answer: result.answer ?? "",
    citations: result.citations ?? [],
    riskLevel: result.riskLevel ?? "low",
    llmCalls: result.llmCalls ?? 0,
  };

  return reply.status(200).send(response);
}
