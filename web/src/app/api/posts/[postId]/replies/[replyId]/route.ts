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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string; replyId: string }> }
) {
  const client = makeClient(req);
  if (!client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { postId, replyId } = await params;
  try {
    await client.deleteReply(postId, replyId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const status = err instanceof Error && err.message === "FORBIDDEN" ? 403 : 500;
    const message = err instanceof Error ? err.message : "Failed to delete reply";
    return NextResponse.json({ error: message }, { status });
  }
}
