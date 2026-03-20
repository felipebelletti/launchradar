import { formatDistanceToNow } from 'date-fns';
import { useAppStore } from '../../store/app.store';
import { useLaunch } from '../../hooks/useLaunch';
import { PanelShell } from './PanelShell';
import { GatedContent } from '../shared/GatedContent';
import type { TweetSignal } from '../../types';

function TweetEntry({ tweet }: { tweet: TweetSignal }) {
  return (
    <div className="py-2 border-b border-radar-border last:border-b-0">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-mono text-radar-muted">
          {tweet.authorHandle[0]?.toUpperCase() ?? '?'}
        </div>
        <span className="text-xs font-mono text-radar-cyan">@{tweet.authorHandle}</span>
        <span className="text-[10px] font-mono text-radar-muted ml-auto">
          {formatDistanceToNow(new Date(tweet.createdAt), { addSuffix: true })}
        </span>
      </div>
      <p className="text-sm text-radar-text/80 line-clamp-2 pl-8">{tweet.text}</p>
      <div className="flex items-center gap-3 pl-8 mt-1">
        <span className="text-[10px] font-mono text-radar-muted">{tweet.likes} likes</span>
        <span className="text-[10px] font-mono text-radar-muted">{tweet.retweets} RTs</span>
      </div>
    </div>
  );
}

export function SourceTweetsPanel({ onClose }: { onClose?: () => void }) {
  const selectedId = useAppStore((s) => s.selectedLaunchId);
  const plan = useAppStore((s) => s.plan);
  const { data: launch } = useLaunch(selectedId);

  return (
    <PanelShell title="SOURCE TWEETS" onClose={onClose}>
      <GatedContent requiredPlan="scout" currentPlan={plan} ctaText="CLASSIFIED \u2014 UPGRADE TO SCOUT">
        {launch?.tweets && launch.tweets.length > 0 ? (
          launch.tweets.map((t) => <TweetEntry key={t.id} tweet={t} />)
        ) : (
          <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
            {selectedId ? 'NO SOURCE TWEETS' : 'SELECT A LAUNCH'}
          </div>
        )}
      </GatedContent>
    </PanelShell>
  );
}
