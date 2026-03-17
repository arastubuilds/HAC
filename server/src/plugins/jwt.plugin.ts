import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

async function jwtPlugin(app: FastifyInstance): Promise<void> {
  // In NodeNext ESM, @fastify/jwt resolves as its merged function+namespace type.
  // .fastifyJwt is the named export typed as FastifyPluginCallback<FastifyJWTOptions>.
  await app.register(fastifyJwt.fastifyJwt, { secret: env.JWT_SECRET });
}

export default fp(jwtPlugin, { name: "jwt-plugin", fastify: "5.x" });
