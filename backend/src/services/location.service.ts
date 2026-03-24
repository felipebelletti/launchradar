import { config } from '../config.js';
import { prisma } from '../db/client.js';
import { createChildLogger } from '../logger.js';
import type { FlagSeverity } from '@prisma/client';

const log = createChildLogger('location');

interface GeoResult {
  country: string;
  city: string;
  lat: number;
  lon: number;
}

export async function geolocateIp(ip: string): Promise<GeoResult | null> {
  // Skip private/localhost IPs
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null;
  }

  try {
    if (config.GEOIP_PROVIDER === 'ip-api') {
      return await geolocateViaIpApi(ip);
    }
    return await geolocateViaAbstractApi(ip);
  } catch (err) {
    log.warn('Geolocation failed', { ip, err });
    return null;
  }
}

async function geolocateViaIpApi(ip: string): Promise<GeoResult | null> {
  const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`);
  if (!res.ok) return null;

  const data = await res.json() as { status: string; country?: string; city?: string; lat?: number; lon?: number };
  if (data.status !== 'success') return null;

  return {
    country: data.country ?? 'Unknown',
    city: data.city ?? 'Unknown',
    lat: data.lat ?? 0,
    lon: data.lon ?? 0,
  };
}

async function geolocateViaAbstractApi(ip: string): Promise<GeoResult | null> {
  if (!config.ABSTRACTAPI_KEY) return null;

  const res = await fetch(
    `https://ipgeolocation.abstractapi.com/v1/?api_key=${config.ABSTRACTAPI_KEY}&ip_address=${ip}`
  );
  if (!res.ok) return null;

  const data = await res.json() as {
    country?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };

  return {
    country: data.country ?? 'Unknown',
    city: data.city ?? 'Unknown',
    lat: data.latitude ?? 0,
    lon: data.longitude ?? 0,
  };
}

interface NewSessionInfo {
  ip: string;
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  fingerprint: string;
}

export async function detectAnomaly(
  userId: string,
  newSession: NewSessionInfo
): Promise<FlagSeverity | null> {
  const recentSessions = await prisma.session.findMany({
    where: {
      userId,
      isActive: true,
      lastSeenAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  if (recentSessions.length === 0) return null;

  for (const existing of recentSessions) {
    // Same fingerprint = same device, no flag
    if (existing.fingerprint === newSession.fingerprint) return null;

    // Same country, different city = LOW (travel)
    if (
      existing.country &&
      newSession.country &&
      existing.country === newSession.country &&
      existing.city !== newSession.city
    ) {
      return 'LOW';
    }

    // Different country
    if (
      existing.country &&
      newSession.country &&
      existing.country !== newSession.country
    ) {
      const timeDiff = Math.abs(
        Date.now() - existing.lastSeenAt.getTime()
      );

      // Sessions within 1h of each other = HIGH (physically impossible)
      if (timeDiff <= 3600000) {
        return 'HIGH';
      }

      // Sessions more than 1h apart = MEDIUM
      return 'MEDIUM';
    }
  }

  return null;
}
