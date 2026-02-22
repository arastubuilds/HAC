import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  //liveness probe
  app.get("/", async () => {
    return {
      status: "ok",
      uptime: process.uptime(),
      timeStamp: new Date().toISOString(),
    };
  });

  // readiness probe (to be expanded)
  app.get("/ready", async () => {
    // In the future will check:
    // - Vector DB connectivity
    // - DB connectivity
    // - LLM availability (optional)
    return {
      status: "ready",
    };
  });
}
