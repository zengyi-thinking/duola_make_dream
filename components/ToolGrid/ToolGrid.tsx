import './ToolGrid.css';

/** 百宝袋工具定义 */
interface ToolItem {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: 'create' | 'play' | 'knowledge' | 'utility';
}

/** 百宝袋预置工具列表 */
const TOOL_ITEMS: ToolItem[] = [
  {
    id: 'imagine',
    name: '具象画笔',
    emoji: '🎨',
    description: '把你的想法画出来',
    category: 'create',
  },
  {
    id: 'story',
    name: '故事织机',
    emoji: '📖',
    description: '一起编一个有趣的故事',
    category: 'create',
  },
  {
    id: 'game',
    name: '趣味玩伴',
    emoji: '🎮',
    description: '猜谜、成语接龙小游戏',
    category: 'play',
  },
  {
    id: 'mood',
    name: '心情天气',
    emoji: '🌤️',
    description: '记录今天的心情',
    category: 'play',
  },
  {
    id: 'lens',
    name: '知识放大镜',
    emoji: '🔍',
    description: '分析当前页面内容',
    category: 'knowledge',
  },
  {
    id: 'collect',
    name: '灵感收集器',
    emoji: '✨',
    description: '保存有趣的想法和素材',
    category: 'utility',
  },
];

interface ToolGridProps {
  onSelect?: (tool: ToolItem) => void;
}

/**
 * 百宝袋工具网格
 * 哆啦A梦的四次元百宝袋 — 各种神奇道具
 */
export default function ToolGrid({ onSelect }: ToolGridProps) {
  return (
    <div className="tool-grid">
      <h3 className="tool-grid__title">🎒 四次元百宝袋</h3>
      <div className="tool-grid__items">
        {TOOL_ITEMS.map((tool) => (
          <button
            key={tool.id}
            className="tool-grid__item"
            onClick={() => onSelect?.(tool)}
            title={tool.description}
          >
            <span className="tool-grid__item-emoji">{tool.emoji}</span>
            <span className="tool-grid__item-name">{tool.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
