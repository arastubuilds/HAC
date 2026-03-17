import { type NextRequest, NextResponse } from "next/server";
import { ApiClient } from "@hac/shared/lib";

const api = new ApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001" });

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email: string; username: string; password: string; firstName?: string; lastName?: string };
  try {
    const { token, user } = await api.register(body);
    const res = NextResponse.json({ user });
    res.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
