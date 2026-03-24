import type { NotificationSound } from '../store/notification.store';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

type SoundDef = (ctx: AudioContext, gain: GainNode) => void;

const SOUNDS: Record<Exclude<NotificationSound, 'none'>, SoundDef> = {
  ping(ctx, gain) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  },

  radar(ctx, gain) {
    // Two-tone sweep
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.1);
    osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.2);
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  },

  alert(ctx, gain) {
    // Double beep
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1000, ctx.currentTime + i * 0.15);
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.08);
    }
  },

  chime(ctx, gain) {
    // Ascending triad
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.15);
    });
  },

  blip(ctx, gain) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.06);
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  },
};

export function playSound(sound: NotificationSound, volume: number) {
  if (sound === 'none') return;
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime); // scale down to avoid loudness
  gain.connect(ctx.destination);
  SOUNDS[sound](ctx, gain);
}

export const SOUND_LABELS: Record<NotificationSound, string> = {
  ping: 'Ping',
  radar: 'Radar',
  alert: 'Alert',
  chime: 'Chime',
  blip: 'Blip',
  none: 'None',
};
