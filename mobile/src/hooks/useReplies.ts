import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { flattenReplies } from "../lib/replyTree";

export function useReplies(postId: string) {
  return useQuery({
    queryKey: ["replies", postId],
    queryFn: async () => {
      const replies = await api.getReplies(postId);
      return flattenReplies(replies);
    },
    enabled: !!postId,
  });
}
