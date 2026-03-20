import { formatDistanceToNow } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import type { TweetSignal } from '../../types';
import { tweetStatusUrl, twitterProfileUrl } from '../../tweet-status-url';
import { TweetTimeBadgePill } from '../shared/TweetTimeBadge';

export function DrawerTweets({ tweets }: { tweets?: TweetSignal[] }) {
  if (!tweets || tweets.length === 0) {
    return <p className="text-sm font-mono text-radar-muted/50">NO SOURCE TWEETS</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {tweets.map((t) => (
        <div key={t.id} className="py-2 border-b border-radar-border last:border-b-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-mono text-radar-muted">
              {t.authorHandle[0]?.toUpperCase() ?? '?'}
            </div>
            <a
              href={twitterProfileUrl(t.authorHandle)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-radar-cyan hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{t.authorHandle.replace(/^@/, '')}
            </a>
            <TweetTimeBadgePill badge={t.timeBadge} timeBadgeDetail={t.timeBadgeDetail} />
            <span className="text-[10px] font-mono text-radar-muted ml-auto">
              {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-radar-text/80 pl-7">{t.text}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 mt-1">
            <span className="text-[10px] font-mono text-radar-muted">{t.likes} likes</span>
            <span className="text-[10px] font-mono text-radar-muted">{t.retweets} RTs</span>
            <a
              href={tweetStatusUrl(t.authorHandle, t.tweetId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] font-mono text-radar-cyan hover:underline"
            >
              <ExternalLink size={10} aria-hidden />
              View on X
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
