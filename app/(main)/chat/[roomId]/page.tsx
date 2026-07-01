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
    <div className="relative z-20 flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col sm:min-h-[calc(100dvh-4rem)]">
      <ChatRoom roomId={roomId} />
    </div>
  );
}
