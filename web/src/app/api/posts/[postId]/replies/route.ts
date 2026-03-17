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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const client = makeClient(req);
  if (!client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { postId } = await params;
  const { content } = (await req.json()) as { content: string };
  try {
    const reply = await client.createReply(postId, content);
    return NextResponse.json(reply, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create reply";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
