import { notFound } from "next/navigation";
import { getPost } from "@/services/post.service";
import { PostDetail } from "@/components/forum/PostDetail";

export default async function PostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  try {
    const post = await getPost(postId);
    return <PostDetail post={post} />;
  } catch {
    notFound();
  }
}
