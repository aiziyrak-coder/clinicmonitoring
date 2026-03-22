import { useEffect, useRef } from 'react';
import { useStore } from '../store';

function getAudioContextClass(): typeof AudioContext {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

/**
 * Plays a short repeating tone when any patient has a critical (red) alarm and audio is not muted.
 * Resumes AudioContext after user gesture (browser autoplay policy).
 */
export function useAudioAlarm() {
  const patients = useStore((state) => state.patients);
  const isAudioMuted = useStore((state) => state.isAudioMuted);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasCritical = Object.values(patients).some((p) => p.alarm.level === 'red');

  useEffect(() => {
    const resumeIfSuspended = () => {
      const ctx = audioCtxRef.current;
      if (ctx?.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', resumeIfSuspended);
    window.addEventListener('keydown', resumeIfSuspended);

    return () => {
      window.removeEventListener('pointerdown', resumeIfSuspended);
      window.removeEventListener('keydown', resumeIfSuspended);
    };
  }, []);

  useEffect(() => {
    if (hasCritical && !isAudioMuted) {
      if (!audioCtxRef.current) {
        const Ctor = getAudioContextClass();
        audioCtxRef.current = new Ctor();
      }

      void audioCtxRef.current.resume().catch(() => {});

      if (!intervalRef.current) {
        intervalRef.current = window.setInterval(() => {
          const ctx = audioCtxRef.current;
          if (!ctx) return;

          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);

          gainNode.gain.setValueAtTime(0, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
          gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);

          osc.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc.start();
          osc.stop(ctx.currentTime + 0.2);
        }, 1000);
      }
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasCritical, isAudioMuted]);

  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== 'closed') {
        void ctx.close().catch(() => {});
      }
    };
  }, []);
}
