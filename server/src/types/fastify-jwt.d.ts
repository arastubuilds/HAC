import "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; username: string; role: string };
    user:    { sub: string; username: string; role: string };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    jwtVerify<T = { sub: string; username: string; role: string }>(options?: unknown): Promise<T>;
    user: { sub: string; username: string; role: string };
  }
  interface FastifyReply {
    jwtSign(
      payload: { sub: string; username: string; role: string },
      opts?: { expiresIn?: string },
    ): Promise<string>;
  }
}
