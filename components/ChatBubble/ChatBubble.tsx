import type { ChatMessage } from '@/lib/agent/types';
import './ChatBubble.css';

interface ChatBubbleProps {
  message: ChatMessage;
}

/**
 * 对话气泡组件
 * 区分用户消息和哆啦A梦消息，左右对齐
 */
export default function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--dora'}`}>
      {/* 哆啦A梦消息显示小头像 */}
      {!isUser && (
        <span className="chat-bubble__avatar-mini" role="img" aria-label="哆啦A梦">
          🔵
        </span>
      )}
      <div className="chat-bubble__content">
        <p className="chat-bubble__text">{message.content}</p>
        <time className="chat-bubble__time">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
    </div>
  );
}
