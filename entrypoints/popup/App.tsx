import { useState } from 'react';
import DoraAvatar from '@/components/DoraAvatar/DoraAvatar';
import ChatBubble from '@/components/ChatBubble/ChatBubble';
import ToolGrid from '@/components/ToolGrid/ToolGrid';
import LineInput from '@/components/LineArt/LineInput';
import type { ChatMessage, DoraEmotion } from '@/lib/agent/types';

/** Popup 主界面 — 哆啦A梦对话窗口 */
export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'dora',
      content: '大雄，今天想做什么梦呀？哆啦A梦随时准备帮你！',
      emotion: 'happy',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [emotion, setEmotion] = useState<DoraEmotion>('default');
  const [showToolGrid, setShowToolGrid] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setEmotion('thinking');

    // TODO: 发送消息到 Background Agent，接收回复
    setTimeout(() => {
      setEmotion('default');
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app">
      {/* 顶部：哆啦A梦头像 + 状态 */}
      <header className="app-header">
        <DoraAvatar emotion={emotion} size={48} />
        <span className="app-title">哆啦造梦</span>
      </header>

      {/* 中间：对话区域 */}
      <main className="app-chat">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
      </main>

      {/* 底部：百宝袋（展开） + 输入栏 */}
      {showToolGrid && (
        <div className="app-toolgrid">
          <ToolGrid onSelect={(tool) => {
            setInput(`/tool ${tool.name} `);
            setShowToolGrid(false);
          }} />
        </div>
      )}

      <footer className="app-footer">
        <button
          className="toolbag-btn"
          title="百宝袋"
          onClick={() => setShowToolGrid(!showToolGrid)}
        >
          🎒
        </button>
        <LineInput
          value={input}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          placeholder="跟哆啦A梦说点什么..."
        />
        <button className="send-btn" onClick={handleSend} title="发送">
          🚀
        </button>
      </footer>
    </div>
  );
}
