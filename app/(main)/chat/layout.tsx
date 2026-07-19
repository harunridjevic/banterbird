import type { Metadata } from "next";
import { ChatViewportShell } from "@/components/chat/ChatViewportShell";

export const metadata: Metadata = {
  title: "Chat",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <ChatViewportShell>{children}</ChatViewportShell>;
}
