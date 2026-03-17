import { ChatContainer } from "@/components/chat/chat-container";
import { ChatProvider } from "@/components/providers/chat-provider";

export default function ChatPage() {
  return (
    <ChatProvider>
      <ChatContainer />
    </ChatProvider>
  );
}
