import { describe, it, expect } from 'vitest';
import nock from 'nock';
import {
  expandLaunchWebsite,
  pickBestProfileWebsiteResolved,
  isSafePublicHttpUrl,
} from '../util/launch-website.js';

describe('expandLaunchWebsite', () => {
  it('follows t.co redirects and returns a sanitized public URL', async () => {
    nock('https://t.co')
      .get('/abc12')
      .reply(302, '', { Location: 'https://pump.fun/coin/xyz' });
    nock('https://pump.fun')
      .get('/coin/xyz')
      .reply(200, '<html></html>');

    const out = await expandLaunchWebsite('https://t.co/abc12');
    expect(out).toBe('https://pump.fun/coin/xyz');
  });

  it('returns undefined when redirect target is not a safe public URL', async () => {
    nock('https://t.co')
      .get('/priv')
      .reply(302, '', { Location: 'http://192.168.0.1/' });

    const out = await expandLaunchWebsite('https://t.co/priv');
    expect(out).toBeUndefined();
  });

  it('returns direct URLs without fetching', async () => {
    const out = await expandLaunchWebsite('example.org');
    expect(out).toBe('https://example.org');
  });
});

describe('pickBestProfileWebsiteResolved', () => {
  it('resolves t.co when no direct non-Twitter URL exists', async () => {
    nock('https://t.co')
      .get('/bio')
      .reply(302, '', { Location: 'https://realproject.io/' });
    nock('https://realproject.io')
      .get('/')
      .reply(200, 'ok');

    const out = await pickBestProfileWebsiteResolved('https://t.co/bio', undefined);
    expect(out).toBe('https://realproject.io/');
  });
});

describe('isSafePublicHttpUrl', () => {
  it('rejects loopback and private IPv4', () => {
    expect(isSafePublicHttpUrl('http://127.0.0.1/')).toBe(false);
    expect(isSafePublicHttpUrl('http://192.168.1.1/')).toBe(false);
    expect(isSafePublicHttpUrl('http://10.0.0.1/')).toBe(false);
  });

  it('allows normal HTTPS origins', () => {
    expect(isSafePublicHttpUrl('https://example.com/path')).toBe(true);
  });
});
