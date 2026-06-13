import type { PocketBuddyMood } from '@/lib/agent/types';
import './PocketBuddyAvatar.css';

interface PocketBuddyAvatarProps {
  mood?: PocketBuddyMood;
}

export default function PocketBuddyAvatar({
  mood = 'warm',
}: PocketBuddyAvatarProps) {
  return (
    <div className="pocket-buddy-avatar" data-mood={mood} aria-hidden="true">
      <div className="pocket-buddy-avatar__halo" />
      <div className="pocket-buddy-avatar__face">
        <span className="pocket-buddy-avatar__eye" />
        <span className="pocket-buddy-avatar__eye" />
        <span className="pocket-buddy-avatar__smile" />
        <span className="pocket-buddy-avatar__pocket" />
      </div>
    </div>
  );
}
