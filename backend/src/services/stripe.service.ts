import Stripe from 'stripe';
import type { User, Plan } from '@prisma/client';
import { prisma } from '../db/client.js';
import { config } from '../config.js';

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!config.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    _stripe = new Stripe(config.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

const PRICE_MAP: Record<string, string> = {
  SCOUT: config.STRIPE_PRICE_SCOUT,
  ALPHA: config.STRIPE_PRICE_ALPHA,
  PRO: config.STRIPE_PRICE_PRO,
};

export async function getOrCreateCustomer(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { userId: user.id },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function createCheckoutSession(user: User, plan: Plan): Promise<string> {
  const priceId = PRICE_MAP[plan];
  if (!priceId) throw new Error(`No Stripe price configured for plan: ${plan}`);

  const stripe = getStripe();
  const customerId = await getOrCreateCustomer(user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${config.FRONTEND_URL}/dashboard?upgraded=true`,
    cancel_url: `${config.FRONTEND_URL}/pricing`,
    metadata: { userId: user.id, plan },
    allow_promotion_codes: true,
  });

  return session.url!;
}

export async function createPortalSession(user: User): Promise<string> {
  const stripe = getStripe();
  const customerId = await getOrCreateCustomer(user);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.FRONTEND_URL}/dashboard`,
  });

  return session.url;
}

export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, config.STRIPE_WEBHOOK_SECRET);
}

export async function retrieveSubscription(subId: string) {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subId);
}

export { PRICE_MAP };
