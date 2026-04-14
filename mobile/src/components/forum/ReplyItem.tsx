import { View, Text, Pressable } from "react-native";
import type { FlatReply } from "../../lib/replyTree";
import { Avatar } from "../ui/Avatar";

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const MAX_DEPTH = 4; // Cap visual indent at 4 levels

interface ReplyItemProps {
  reply: FlatReply;
  currentUserId?: string;
  onReply: (replyId: string) => void;
  onDelete: (replyId: string) => void;
}

export function ReplyItem({ reply, currentUserId, onReply, onDelete }: ReplyItemProps) {
  const displayName = reply.username ?? reply.userId.slice(0, 8);
  const isOwner = currentUserId === reply.userId;
  const indent = Math.min(reply.depth, MAX_DEPTH) * 16;

  return (
    <View style={{ paddingLeft: indent }} className="mb-3">
      {reply.depth > 0 && (
        <View className="absolute left-0 top-0 bottom-0 w-px bg-neutral-200" style={{ left: indent - 8 }} />
      )}
      <View className="bg-white border border-neutral-200 rounded-xl p-3">
        <View className="flex-row items-center gap-2 mb-2">
          <Avatar name={displayName} size="sm" />
          <Text className="font-body-semibold text-neutral-700 text-xs flex-1">
            {displayName}
          </Text>
          <Text className="font-body text-neutral-400 text-xs">
            {formatRelativeDate(reply.createdAt)}
          </Text>
        </View>
        <Text className="font-body text-neutral-800 text-sm leading-5">
          {reply.content}
        </Text>
        <View className="flex-row gap-3 mt-2">
          <Pressable onPress={() => onReply(reply.id)} hitSlop={8}>
            <Text className="font-body-semibold text-primary text-xs">Reply</Text>
          </Pressable>
          {isOwner && (
            <Pressable onPress={() => onDelete(reply.id)} hitSlop={8}>
              <Text className="font-body-semibold text-red-400 text-xs">Delete</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
