import { type NextRequest, NextResponse } from "next/server";
import { ApiClient } from "@hac/shared/lib";

const api = new ApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001" });

export async function POST(req: NextRequest) {
  const { email, password } = (await req.json()) as { email: string; password: string };
  try {
    const { token, user } = await api.login(email, password);
    const res = NextResponse.json({ user });
    res.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
