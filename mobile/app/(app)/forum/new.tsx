import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../../src/lib/api";
import { PostForm } from "../../../src/components/forum/PostForm";

export default function NewPostScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSubmit(title: string, content: string) {
    await api.createPost(title, content);
    await queryClient.invalidateQueries({ queryKey: ["posts"] });
    router.back();
  }

  return <PostForm submitLabel="Post" onSubmit={handleSubmit} />;
}
