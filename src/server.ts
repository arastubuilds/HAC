import fastify from "fastify";
import { healthRoutes } from "./routes/health.js";
import { env } from "./config/env.js";

export function buildServer() {
    const app = fastify({
        trustProxy: true,       // importand behind load balancers
    });
    app.register(healthRoutes, {prefix: "/health"});
    return app;
}


const server = buildServer();
const PORT = env.PORT;
const HOST = "0.0.0.0";

async function start() {
    try {
        await server.listen({port: PORT, host: HOST});
        console.log(`Server listening on ${HOST}:${PORT}`);
    } catch (error) {
        console.log(error);
        process.exit(1);
    }
}

start();

const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down...`);
    try {
        await server.close();
        process.exit(0);
    } catch (err) {
        console.error("Error during shutdown", err);
        process.exit(1);
    }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);