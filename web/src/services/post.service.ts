import { cookies } from "next/headers";
import { ApiClient } from "@hac/shared/lib";

async function makeClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return new ApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
    ...(token !== undefined ? { getToken: () => token } : {}),
  });
}

export async function getPosts(page = 1) {
  const client = await makeClient();
  return client.getPosts(page, 20);
}

export async function getPost(postId: string) {
  const client = await makeClient();
  return client.getPost(postId);
}
