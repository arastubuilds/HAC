import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function usePosts() {
  return useInfiniteQuery({
    queryKey: ["posts"],
    queryFn: ({ pageParam }) => api.getPosts(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.pageSize);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
  });
}
