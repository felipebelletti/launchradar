import { Worker, Job } from 'bullmq';
import { getBullMQConnection } from '../redis.js';
import { prisma } from '../db/client.js';
import * as twitterApi from '../services/twitterapi.service.js';
import { ingestTweet } from '../services/ingest.service.js';
import { createChildLogger } from '../logger.js';
import type { TweetData } from '../types/index.js';

const log = createChildLogger('account-poll-worker');

interface PollAccountJob {
  handle: string;
}

function normalizeSearchTweet(raw: twitterApi.AdvancedSearchResult['tweets'][number]): TweetData {
  const imageUrls = (raw.photos ?? []).map(p => p.url);
  return {
    id: raw.id,
    text: raw.text,
    authorHandle: raw.author.userName,
    authorId: raw.author.id,
    authorBio: raw.author.description ?? '',
    authorFollowers: raw.author.publicMetrics?.followersCount ?? 0,
    authorIsVerified: raw.author.isVerified === true || raw.author.isBlueVerified === true,
    authorWebsite: raw.author.website,
    imageUrls,
    likes: raw.likeCount,
    retweets: raw.retweetCount,
    createdAt: new Date(raw.createdAt),
  };
}

export function startAccountPollWorker(): Worker<PollAccountJob> {
  const worker = new Worker<PollAccountJob>(
    'account-poll',
    async (job: Job<PollAccountJob>) => {
      const { handle } = job.data;

      const monitor = await prisma.monitoredAccount.findUnique({
        where: { twitterHandle: handle },
      });

      if (!monitor || !monitor.active) {
        log.debug('Account deactivated, removing repeatable job', { handle });
        return;
      }

      // Safety check: verify the linked LaunchRecord still exists.
      // If it was deleted during a merge, deactivate the orphaned monitor.
      if (monitor.launchRecordId) {
        const recordExists = await prisma.launchRecord.findUnique({
          where: { id: monitor.launchRecordId },
          select: { id: true },
        });
        if (!recordExists) {
          log.warn('MonitoredAccount references deleted LaunchRecord, deactivating', {
            handle,
            staleRecordId: monitor.launchRecordId,
          });
          await prisma.monitoredAccount.update({
            where: { twitterHandle: handle },
            data: { active: false },
          });
          return;
        }
      }

      // Use lastPollAt if available, otherwise activatedAt
      // This is the key: we only ever fetch tweets AFTER we started monitoring
      const since = monitor.lastPollAt ?? monitor.activatedAt;

      log.debug('Polling account for new tweets', { handle, since });

      const result = await twitterApi.advancedSearch(
        `from:${handle} -is:retweet`,
        'Latest',
        undefined,
        since
      );

      // Update lastPollAt immediately, even if no tweets found
      await prisma.monitoredAccount.update({
        where: { twitterHandle: handle },
        data: { lastPollAt: new Date() },
      });

      const tweets = result.tweets;
      if (!tweets || tweets.length === 0) {
        log.debug('No new tweets found', { handle });
        return;
      }

      log.info('New tweets found for monitored account', {
        handle,
        count: tweets.length,
      });

      // Update lastTweetAt
      await prisma.monitoredAccount.update({
        where: { twitterHandle: handle },
        data: { lastTweetAt: new Date() },
      });

      // Process each tweet through the ingest pipeline
      // These are Tier C tweets: skip Stage 1 + Stage 2 (account already crypto-confirmed)
      for (const raw of tweets) {
        const tweetData = normalizeSearchTweet(raw);
        await ingestTweet(tweetData, 'TIER_C');
      }
    },
    { connection: getBullMQConnection(), concurrency: 5, lockDuration: 60_000 }
  );

  worker.on('failed', (job, err) => {
    log.error('Account poll job failed', { job: job?.id, err });
  });

  log.info('Account poll worker started');
  return worker;
}
