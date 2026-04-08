import fastify, { type FastifyError } from "fastify";
import { healthRoutes } from "./api/routes/health.route.js";
import { postsRoutes } from "./api/routes/posts.route.js";
import { queryRoutes } from "./api/routes/query.route.js";
import { authRoutes } from "./api/routes/auth.route.js";
import { repliesRoutes } from "./api/routes/replies.route.js";
import { adminReviewRoutes } from "./api/routes/adminReview.routes.js";
import jwtPlugin from "./plugins/jwt.plugin.js";
import { env } from "./config/env.js";
import { prisma } from "./infra/prisma.js";

export async function buildServer() {
    const app = fastify({
        logger: true,
        trustProxy: true,
        bodyLimit: 102400, // 100KB
    });

    await app.register(import("@fastify/cors"), {
        origin: env.FRONTEND_URL,
        credentials: true,
    });

    await app.register(import("@fastify/rate-limit"), {
        global: true,
        max: 100,
        timeWindow: "1 minute",
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
            error: env.NODE_ENV === "development" ? error.message : "Internal server error",
        });
    })

    app.register(jwtPlugin);
    app.register(healthRoutes, {prefix: "/health"});
    app.register(authRoutes,   {prefix: "/auth"});
    app.register(postsRoutes,  {prefix: "/posts"});
    app.register(queryRoutes,  {prefix: "/query"});
    app.register(repliesRoutes);
    app.register(adminReviewRoutes, { prefix: "/admin/reviews" });
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
        await prisma.$disconnect();
        process.exit(0);
    } catch (err) {
        console.error("Error during shutdown", err);
        process.exit(1);
    }
};

process.on("SIGINT", (signal) => { void shutdown(signal); });
process.on("SIGTERM", (signal) => { void shutdown(signal); });
