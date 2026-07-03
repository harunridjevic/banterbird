import { ChatViewportShell } from "@/components/chat/ChatViewportShell";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <ChatViewportShell>{children}</ChatViewportShell>;
}
