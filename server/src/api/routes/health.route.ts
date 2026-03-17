import { type FastifyInstance } from "fastify";

export function healthRoutes(app: FastifyInstance) {
  //liveness probe
  app.get("/", () => {
    return {
      status: "ok",
      uptime: process.uptime(),
      timeStamp: new Date().toISOString(),
    };
  });

  // readiness probe (to be expanded)
  app.get("/ready", () => {
    // In the future will check:
    // - Vector DB connectivity
    // - DB connectivity
    // - LLM availability (optional)
    return {
      status: "ready",
    };
  });
}
