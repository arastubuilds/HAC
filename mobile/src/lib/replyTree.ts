import type { ReplyResponse } from "@hac/shared/types";

export type FlatReply = ReplyResponse & { depth: number };

/**
 * Converts a flat list of replies (potentially out of order) into a threaded
 * flat list with depth metadata. Parents always appear before their children.
 */
export function flattenReplies(replies: ReplyResponse[]): FlatReply[] {
  const byId = new Map<string, ReplyResponse>();
  for (const r of replies) byId.set(r.id, r);

  // Compute depth for each reply
  const depthMap = new Map<string, number>();
  function getDepth(id: string): number {
    if (depthMap.has(id)) return depthMap.get(id)!;
    const reply = byId.get(id);
    if (!reply || !reply.parentReplyId) {
      depthMap.set(id, 0);
      return 0;
    }
    const depth = getDepth(reply.parentReplyId) + 1;
    depthMap.set(id, depth);
    return depth;
  }
  for (const r of replies) getDepth(r.id);

  // Group children by parent
  const childrenOf = new Map<string | null, ReplyResponse[]>();
  for (const r of replies) {
    const key = r.parentReplyId ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(r);
  }

  // DFS traversal to produce parent-before-children ordering
  const result: FlatReply[] = [];
  function visit(parentId: string | null) {
    const children = childrenOf.get(parentId) ?? [];
    for (const child of children) {
      result.push({ ...child, depth: depthMap.get(child.id) ?? 0 });
      visit(child.id);
    }
  }
  visit(null);

  return result;
}
