import { forwardRef } from "react";
import { ChatInterface } from "./ChatInterface";
import { RECRUITING_CONFIG } from "./chatTypes";
import type { ChatHandle, ConversationMeta } from "./chatTypes";

interface RecruitingChatWrapperProps {
  userId: string;
  isAdmin?: boolean;
  externalActiveId?: string;
  onConvsChange?: (convs: ConversationMeta[], activeId: string) => void;
}

export const RecruitingChatWrapper = forwardRef<ChatHandle, RecruitingChatWrapperProps>(
  (props, ref) => (
    <ChatInterface ref={ref} config={RECRUITING_CONFIG} {...props} />
  )
);

RecruitingChatWrapper.displayName = "RecruitingChatWrapper";
