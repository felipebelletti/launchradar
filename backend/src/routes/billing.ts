import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Plan } from '@prisma/client';
import { createChildLogger } from '../logger.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import {
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  retrieveSubscription,
} from '../services/stripe.service.js';
import { getEffectivePlan } from '../services/plan.service.js';
import { maybeStartTrial } from '../services/trial.service.js';

const log = createChildLogger('billing-routes');

export default async function billingRoutes(app: FastifyInstance) {
  // ── POST /billing/checkout ───────────────────────────────
  app.post(
    '/billing/checkout',
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { plan } = request.body as { plan?: string };
      if (!plan || !['SCOUT', 'ALPHA', 'PRO'].includes(plan)) {
        return reply.status(400).send({ error: 'Invalid plan' });
      }

      const user = await prisma.user.findUnique({ where: { id: request.user!.id } });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const url = await createCheckoutSession(user, plan as Plan);
      return reply.send({ url });
    },
  );

  // ── POST /billing/portal ─────────────────────────────────
  app.post(
    '/billing/portal',
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await prisma.user.findUnique({ where: { id: request.user!.id } });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const url = await createPortalSession(user);
      return reply.send({ url });
    },
  );

  // ── GET /billing/status ──────────────────────────────────
  app.get(
    '/billing/status',
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user!.id },
        include: { subscription: true },
      });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const effectivePlan = getEffectivePlan(user);
      const isTrialing = !!(
        user.trialExpiresAt && user.trialExpiresAt > new Date() && user.trialPlan
      );

      return reply.send({
        plan: effectivePlan,
        basePlan: user.plan,
        isTrialing,
        trialExpiresAt: user.trialExpiresAt,
        subscription: user.subscription
          ? {
              status: user.subscription.status,
              plan: user.subscription.plan,
              currentPeriodEnd: user.subscription.currentPeriodEnd,
              cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
            }
          : null,
      });
    },
  );

  // ── POST /billing/webhook ────────────────────────────────
  // Must use raw body — Stripe signature verification needs it
  app.post(
    '/billing/webhook',
    {
      config: { rawBody: true } as Record<string, unknown>,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers['stripe-signature'] as string;
      if (!signature) return reply.status(400).send({ error: 'Missing signature' });

      let event;
      try {
        const rawBody = (request as unknown as { rawBody: Buffer }).rawBody;
        event = constructWebhookEvent(rawBody, signature);
      } catch (err) {
        log.warn('Stripe webhook signature verification failed', { err });
        return reply.status(400).send({ error: 'Invalid signature' });
      }

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as { metadata?: Record<string, string>; subscription?: string };
          const userId = session.metadata?.userId;
          const plan = session.metadata?.plan as Plan | undefined;
          if (!userId || !plan) break;

          const stripeSubId = session.subscription as string;

          // Fetch subscription details from Stripe
          const sub = await retrieveSubscription(stripeSubId);
          const item = sub.items.data[0];
          const periodStart = item ? new Date(item.current_period_start * 1000) : new Date();
          const periodEnd = item ? new Date(item.current_period_end * 1000) : new Date();

          await prisma.subscription.upsert({
            where: { userId },
            create: {
              userId,
              stripeSubId,
              stripePriceId: item?.price.id ?? '',
              plan,
              status: 'ACTIVE',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            },
            update: {
              stripeSubId,
              stripePriceId: item?.price.id ?? '',
              plan,
              status: 'ACTIVE',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            },
          });

          await prisma.user.update({
            where: { id: userId },
            data: { plan, stripeSubId, planUpdatedAt: new Date() },
          });

          log.info('Subscription activated via checkout', { userId, plan });
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as { subscription?: string };
          const subId = invoice.subscription as string | undefined;
          if (!subId) break;

          await prisma.subscription.updateMany({
            where: { stripeSubId: subId },
            data: { status: 'PAST_DUE' },
          });

          log.warn('Payment failed — subscription marked PAST_DUE', { stripeSubId: subId });
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as { id: string };
          await prisma.user.updateMany({
            where: { stripeSubId: sub.id },
            data: { plan: 'FREE', stripeSubId: null, planUpdatedAt: new Date() },
          });
          await prisma.subscription.updateMany({
            where: { stripeSubId: sub.id },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          });

          log.info('Subscription cancelled — downgraded to FREE', { stripeSubId: sub.id });
          break;
        }

        case 'customer.subscription.updated': {
          // Fetch the full subscription from Stripe to get period dates from items
          const updatedSub = await retrieveSubscription(
            (event.data.object as { id: string }).id,
          );
          const updatedItem = updatedSub.items.data[0];

          const priceId = updatedItem?.price.id;
          // Determine plan from price ID
          let updatedPlan: Plan = 'FREE';
          if (priceId === config.STRIPE_PRICE_SCOUT) updatedPlan = 'SCOUT';
          else if (priceId === config.STRIPE_PRICE_ALPHA) updatedPlan = 'ALPHA';
          else if (priceId === config.STRIPE_PRICE_PRO) updatedPlan = 'PRO';

          await prisma.subscription.updateMany({
            where: { stripeSubId: updatedSub.id },
            data: {
              plan: updatedPlan,
              stripePriceId: priceId ?? '',
              currentPeriodStart: updatedItem ? new Date(updatedItem.current_period_start * 1000) : undefined,
              currentPeriodEnd: updatedItem ? new Date(updatedItem.current_period_end * 1000) : undefined,
              cancelAtPeriodEnd: updatedSub.cancel_at_period_end,
            },
          });

          // Also update user plan
          const subscription = await prisma.subscription.findUnique({
            where: { stripeSubId: updatedSub.id },
          });
          if (subscription) {
            await prisma.user.update({
              where: { id: subscription.userId },
              data: { plan: updatedPlan, planUpdatedAt: new Date() },
            });
          }

          log.info('Subscription updated', { stripeSubId: updatedSub.id, plan: updatedPlan });
          break;
        }
      }

      return reply.send({ received: true });
    },
  );

  // ── POST /auth/trial/activate ────────────────────────────
  app.post(
    '/auth/trial/activate',
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { fingerprint } = request.body as { fingerprint?: string };
      if (!fingerprint) {
        return reply.status(400).send({ error: 'Fingerprint required' });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.user!.id },
      });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const result = await maybeStartTrial(user, fingerprint);

      if (!result.activated) {
        return reply.status(409).send({ error: result.reason });
      }

      return reply.send({ ok: true });
    },
  );
}
