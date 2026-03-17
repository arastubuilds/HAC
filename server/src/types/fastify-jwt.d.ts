import "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; username: string };
    user:    { sub: string; username: string };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    jwtVerify<T = { sub: string; username: string }>(options?: unknown): Promise<T>;
    user: { sub: string; username: string };
  }
  interface FastifyReply {
    jwtSign(
      payload: { sub: string; username: string },
      opts?: { expiresIn?: string },
    ): Promise<string>;
  }
}
