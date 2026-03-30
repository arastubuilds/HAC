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

export async function GET(req: NextRequest) {
  const client = makeClient(req);
  if (!client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  try {
    const reviews = await client.getReviews({
      status: searchParams.get("status") ?? undefined,
      importRunId: searchParams.get("importRunId") ?? undefined,
      publishDecision: searchParams.get("publishDecision") ?? undefined,
    });
    return NextResponse.json(reviews);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch reviews";
    if (/Unauthorized|401/.test(message)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
