import fastify, { type FastifyError } from "fastify";
import { healthRoutes } from "./api/routes/health.route.js";
import { postsRoutes } from "./api/routes/posts.route.js";
import { queryRoutes } from "./api/routes/query.route.js";
import { authRoutes } from "./api/routes/auth.route.js";
import { repliesRoutes } from "./api/routes/replies.route.js";
import jwtPlugin from "./plugins/jwt.plugin.js";
import { env } from "./config/env.js";

export async function buildServer() {
    const app = fastify({
        trustProxy: true,       // importand behind load balancers
    });

    await app.register(import("@fastify/cors"), {
        origin: env.FRONTEND_URL,
        credentials: true,
    });

    app.setErrorHandler((error: FastifyError, request, reply) => {
        request.log.error(error);
        if (error.validation) {
            return reply.status(400).send({
                error: "Validation failed",
                details: error.validation,
            });
        }
        return reply.status(500).send({
            error: error.message,
        });
    })

    app.register(jwtPlugin);
    app.register(healthRoutes, {prefix: "/health"});
    app.register(authRoutes,   {prefix: "/auth"});
    app.register(postsRoutes,  {prefix: "/posts"});
    app.register(queryRoutes,  {prefix: "/query"});
    app.register(repliesRoutes);
    return app;
}


const PORT = env.PORT;
const HOST = "0.0.0.0";

let runningServer: Awaited<ReturnType<typeof buildServer>> | null = null;

async function start() {
    try {
        runningServer = await buildServer();
        await runningServer.listen({port: PORT, host: HOST});
        console.log(`Server listening on ${HOST}:${PORT}`);
    } catch (error) {
        console.log(error);
        process.exit(1);
    }
}

void start();

const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down...`);
    try {
        await runningServer?.close();
        process.exit(0);
    } catch (err) {
        console.error("Error during shutdown", err);
        process.exit(1);
    }
};

process.on("SIGINT", (signal) => { void shutdown(signal); });
process.on("SIGTERM", (signal) => { void shutdown(signal); });
