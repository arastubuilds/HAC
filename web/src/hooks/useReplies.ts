"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiClient } from "@hac/shared/lib";
import type { ReplyResponse } from "@hac/shared/types";

const api = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
});

export function useReplies(postId: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["replies", postId],
    queryFn: () => api.getReplies(postId),
  });

  const createReply = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/posts/${postId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to post reply");
      return res.json() as Promise<ReplyResponse>;
    },
    onMutate: async (content) => {
      await qc.cancelQueries({ queryKey: ["replies", postId] });
      const prev = qc.getQueryData<ReplyResponse[]>(["replies", postId]);
      qc.setQueryData<ReplyResponse[]>(["replies", postId], (old) => [
        ...(old ?? []),
        {
          id: crypto.randomUUID(),
          postId,
          userId: "me",
          content,
          createdAt: new Date().toISOString(),
        },
      ]);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["replies", postId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["replies", postId] }),
  });

  const deleteReply = useMutation({
    mutationFn: async (replyId: string) => {
      const res = await fetch(`/api/posts/${postId}/replies/${replyId}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete reply");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["replies", postId] }),
  });

  return { query, createReply, deleteReply };
}
