import { forwardRef } from "react";
import { ChatInterface } from "./ChatInterface";
import { AI_STAFFING_CONFIG } from "./chatTypes";
import type { ChatHandle, ConversationMeta } from "./chatTypes";

interface AIChatWrapperProps {
  userId: string;
  isAdmin?: boolean;
  externalActiveId?: string;
  onConvsChange?: (convs: ConversationMeta[], activeId: string) => void;
}

export const AIChatWrapper = forwardRef<ChatHandle, AIChatWrapperProps>(
  (props, ref) => (
    <ChatInterface ref={ref} config={AI_STAFFING_CONFIG} {...props} />
  )
);

AIChatWrapper.displayName = "AIChatWrapper";
