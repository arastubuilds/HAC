import { type NextRequest, NextResponse } from "next/server";
import { ApiClient } from "@hac/shared/lib";

function makeClient(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  return new ApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
    getToken: () => token,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = makeClient(req);
  if (!client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { decision, reason } = (await req.json()) as {
    decision: "approved" | "rejected";
    reason: string;
  };
  try {
    await client.resolveReview(id, decision, reason);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
