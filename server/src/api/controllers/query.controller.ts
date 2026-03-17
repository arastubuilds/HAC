import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { QueryRequestDTO } from "../dtos/query.dto.js";
import { cancerSupportAgent } from "../../ai/agents/query_support/graph.js";
import { AgentStateType } from "../../ai/agents/query_support/state.js";

export async function queryHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = QueryRequestDTO.safeParse(req.body);

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid request body",
      details: z.treeifyError(parsed.error),
    });
  }

  reply.hijack();

  const raw = reply.raw;
  raw.setHeader("Content-Type", "text/event-stream");
  raw.setHeader("Cache-Control", "no-cache");
  raw.setHeader("Connection", "keep-alive");
  raw.setHeader("Access-Control-Allow-Origin", "*");
  raw.flushHeaders();

  let aborted = false;
  req.raw.on("close", () => {
    aborted = true;
  });

  const writeEvent = (data: object) => {
    raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const agentStream = await cancerSupportAgent.stream(
      { messages: [new HumanMessage(parsed.data.message)] },
      { streamMode: ["custom", "values"] as ["custom", "values"] },
    );

    let lastState: Partial<AgentStateType> = {};

    for await (const [mode, chunk] of agentStream) {
      if (aborted) break;

      if (mode === "custom") {
        const ev = chunk as { event: string; data: Record<string, unknown> };
        if (ev.event === "answer_token") {
          writeEvent({ type: "token", content: ev.data.token });
        } else if (ev.event === "status") {
          writeEvent({ type: "status", stage: ev.data.stage });
        }
      } else if (mode === "values") {
        lastState = chunk as Partial<AgentStateType>;
      }
    }

    if (!aborted) {
      writeEvent({
        type: "done",
        citations: lastState.citations ?? [],
        riskLevel: lastState.riskLevel ?? "low",
        llmCalls: lastState.llmCalls ?? 0,
      });
    }
  } catch (err) {
    console.error("[queryHandler] agent stream failed:", err);
    writeEvent({ type: "error", message: "Failed to process query. Please try again." });
  } finally {
    raw.end();
  }
}
