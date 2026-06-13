import './ToolGrid.css';

interface ToolItem {
  id: string;
  name: string;
  description: string;
}

const TOOL_ITEMS: ToolItem[] = [
  {
    id: 'idea-lens',
    name: 'IdeaLens',
    description: '把模糊想法扩成一个更清晰的产品方向',
  },
  {
    id: 'product-camera',
    name: 'ProductCamera',
    description: '把产品方向翻译成可视化 Prompt',
  },
  {
    id: 'shrink-light',
    name: 'ShrinkLight',
    description: '把大想法压成 3 步 MVP',
  },
  {
    id: 'memory-bread',
    name: 'MemoryBread',
    description: '记住你的视觉与产品偏好',
  },
  {
    id: 'anywhere-door',
    name: 'AnywhereDoor',
    description: '把网页里主动选中的片段带进口袋',
  },
];

interface ToolGridProps {
  onSelect?: (tool: ToolItem) => void;
}

export default function ToolGrid({ onSelect }: ToolGridProps) {
  return (
    <div className="tool-grid">
      <h3 className="tool-grid__title">Wonder Pocket Gadgets</h3>
      <div className="tool-grid__items">
        {TOOL_ITEMS.map((tool) => (
          <button
            key={tool.id}
            className="tool-grid__item"
            onClick={() => onSelect?.(tool)}
            title={tool.description}
          >
            <span className="tool-grid__item-name">{tool.name}</span>
            <span className="tool-grid__item-desc">{tool.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
