import type { Metadata } from "next";
import { ChatRoom } from "@/components/chat/ChatRoom";

export const metadata: Metadata = {
  title: "Chat",
};

export default async function ChatPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatRoom roomId={roomId} />
    </div>
  );
}
