import assert from "node:assert/strict";
import fastify, { type FastifyError } from "fastify";
import jwtPlugin from "./plugins/jwt.plugin.js";
import { authRoutes } from "./api/routes/auth.route.js";
import { authenticate } from "./api/middleware/authenticate.middleware.js";
import { prisma } from "./infra/prisma.js";

// ── Test server ────────────────────────────────────────────────────────────────

const app = fastify();

app.setErrorHandler((error: FastifyError, _request, reply) => {
  if (error.validation) {
    return reply.status(400).send({ error: "Validation failed", details: error.validation });
  }
  return reply.status(500).send({ error: error.message });
});

await app.register(jwtPlugin);
await app.register(authRoutes, { prefix: "/auth" });

// Minimal protected route — avoids pulling in posts.service → Redis
app.get("/protected", { preHandler: authenticate }, async (_req, reply) => {
  return reply.status(200).send({ ok: true });
});

await app.ready();

// ── Unique credentials ─────────────────────────────────────────────────────────

const ts = Date.now();
const EMAIL = `test_${ts}@example.com`;
const USERNAME = `testuser_${ts}`;
const PASSWORD = "TestPassword123!";

let token = "";
let passed = 0;

function ok(name: string) {
  console.log(`\x1b[32m✓ ${name}\x1b[0m`);
  passed++;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

// 1. Register success
{
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: EMAIL, username: USERNAME, password: PASSWORD },
  });
  assert.equal(res.statusCode, 201, `Register success: expected 201, got ${res.statusCode} — ${res.body}`);
  const body = res.json<{ token: string; user: { id: string } }>();
  assert.ok(body.token, "Register success: missing token");
  assert.ok(body.user?.id, "Register success: missing user.id");
  ok("Register success");
}

// 2. Register duplicate email
{
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: EMAIL, username: `other_${ts}`, password: PASSWORD },
  });
  assert.equal(res.statusCode, 409, `Register duplicate email: expected 409, got ${res.statusCode} — ${res.body}`);
  ok("Register duplicate email");
}

// 3. Register duplicate username
{
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: `other_${ts}@example.com`, username: USERNAME, password: PASSWORD },
  });
  assert.equal(res.statusCode, 409, `Register duplicate username: expected 409, got ${res.statusCode} — ${res.body}`);
  ok("Register duplicate username");
}

// 4. Register invalid input (bad email, short password)
{
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "not-an-email", username: `u_${ts}`, password: "short" },
  });
  assert.equal(res.statusCode, 400, `Register invalid input: expected 400, got ${res.statusCode} — ${res.body}`);
  ok("Register invalid input");
}

// 5. Login success
{
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: EMAIL, password: PASSWORD },
  });
  assert.equal(res.statusCode, 200, `Login success: expected 200, got ${res.statusCode} — ${res.body}`);
  const body = res.json<{ token: string }>();
  assert.ok(body.token, "Login success: missing token");
  token = body.token;
  ok("Login success");
}

// 6. Login wrong password
{
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: EMAIL, password: "WrongPassword999!" },
  });
  assert.equal(res.statusCode, 401, `Login wrong password: expected 401, got ${res.statusCode} — ${res.body}`);
  ok("Login wrong password");
}

// 7. Login unknown email
{
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: `nobody_${ts}@example.com`, password: PASSWORD },
  });
  assert.equal(res.statusCode, 401, `Login unknown email: expected 401, got ${res.statusCode} — ${res.body}`);
  ok("Login unknown email");
}

// 8. Protected route — no token
{
  const res = await app.inject({
    method: "GET",
    url: "/protected",
  });
  assert.equal(res.statusCode, 401, `Protected no token: expected 401, got ${res.statusCode} — ${res.body}`);
  ok("Protected route — no token");
}

// 9. Protected route — valid token
{
  const res = await app.inject({
    method: "GET",
    url: "/protected",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200, `Protected valid token: expected 200, got ${res.statusCode} — ${res.body}`);
  ok("Protected route — valid token");
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

await prisma.user.delete({ where: { email: EMAIL } });
await app.close();
await prisma.$disconnect();

console.log(`\n\x1b[32mAll ${passed} tests passed.\x1b[0m`);
