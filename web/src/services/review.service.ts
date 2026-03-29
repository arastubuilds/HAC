import { cookies } from "next/headers";
import { ApiClient } from "@hac/shared/lib";

async function makeClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) throw new Error("Unauthorized");
  return new ApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
    getToken: () => token,
  });
}

export async function getPendingReviews() {
  const client = await makeClient();
  return client.getReviews({ status: "pending" });
}
