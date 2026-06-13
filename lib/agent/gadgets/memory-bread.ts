import type { UserProfile } from '../types';

export function runMemoryBread(profile: UserProfile): string[] {
  const lines: string[] = [];

  if (profile.visualLikes.length > 0) {
    lines.push(`偏好视觉：${profile.visualLikes.slice(0, 3).join('、')}`);
  }
  if (profile.productPreferences.length > 0) {
    lines.push(`常见产品方向：${profile.productPreferences.slice(0, 3).join('、')}`);
  }
  if (profile.visualDislikes.length > 0) {
    lines.push(`近期避开：${profile.visualDislikes.slice(0, 2).join('、')}`);
  }

  return lines;
}
