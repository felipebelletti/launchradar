import { Resend } from 'resend';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('email');

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    if (!config.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resend = new Resend(config.RESEND_API_KEY);
  }
  return resend;
}

export async function sendMagicLinkEmail(
  email: string,
  magicUrl: string
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: config.EMAIL_FROM,
    to: email,
    subject: 'Sign in to LaunchRadar',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; color: #f5a623; letter-spacing: 2px; text-align: center; margin-bottom: 32px;">
          ◈ LAUNCHRADAR
        </h1>
        <p style="color: #333; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
          Click the button below to sign in to your account. This link expires in ${config.MAGIC_LINK_EXPIRY_MINUTES} minutes.
        </p>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${magicUrl}" style="display: inline-block; padding: 14px 32px; background-color: #f5a623; color: #000; font-weight: 600; text-decoration: none; border-radius: 8px; font-size: 16px;">
            Sign in to LaunchRadar
          </a>
        </div>
        <p style="color: #888; font-size: 13px; line-height: 1.5;">
          If you didn't request this email, you can safely ignore it.
        </p>
        <p style="color: #888; font-size: 13px; line-height: 1.5; word-break: break-all;">
          Or copy this link: ${magicUrl}
        </p>
      </div>
    `,
  });

  if (error) {
    log.error('Failed to send magic link email', { email, error });
    throw new Error('Failed to send email');
  }

  log.info('Magic link email sent', { email });
}
