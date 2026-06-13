import AnimatedTree from '@/components/AnimatedTree/AnimatedTree';
import type { MindmapRecord } from '@/lib/agent/types';

interface MindmapPreviewProps {
  node: MindmapRecord['result']['root'];
}

export default function MindmapPreview({ node }: MindmapPreviewProps) {
  return <AnimatedTree root={node} />;
}

export { MindmapPreview as TreePreview };
