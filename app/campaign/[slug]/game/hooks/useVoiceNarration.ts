'use client';

import { useState, useRef, useCallback } from 'react';
import { createVoiceNarrationController } from './voice-narration-controller';

const STORAGE_KEY = 'saga:voice-narration';

export interface UseVoiceNarration {
  enabled: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  lastText: string | null;
  speak: (text: string) => Promise<void>;
  replay: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
}

export function useVoiceNarration(): UseVoiceNarration {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored !== 'false';
    } catch {
      return true;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const controllerRef = useRef(createVoiceNarrationController());

  controllerRef.current.setEnabled(enabled);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setIsLoading(false);
    setIsPlaying(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!enabled) return;
    stop();
    setLastText(text);
    setIsLoading(true);
    const requestId = controllerRef.current.beginRequest();
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!controllerRef.current.shouldProcess(requestId)) {
        return;
      }
      if (!res.ok) {
        console.error(JSON.stringify({ level: 'error', event: 'tts_request_failed', status: res.status }));
        setIsLoading(false);
        return;
      }
      const blob = await res.blob();
      if (!controllerRef.current.shouldProcess(requestId)) {
        setIsLoading(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        blobUrlRef.current = null;
      };
      audio.onerror = () => {
        setIsPlaying(false);
        console.error(JSON.stringify({ level: 'error', event: 'tts_playback_error' }));
      };
      if (!controllerRef.current.shouldProcess(requestId)) {
        audio.pause();
        audioRef.current = null;
        URL.revokeObjectURL(url);
        blobUrlRef.current = null;
        setIsLoading(false);
        setIsPlaying(false);
        return;
      }
      setIsLoading(false);
      setIsPlaying(true);
      await audio.play();
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', event: 'tts_speak_error', error: String(err) }));
      setIsLoading(false);
      setIsPlaying(false);
    }
  }, [enabled, stop]);

  const replay = useCallback(async () => {
    if (!lastText) return;
    await speak(lastText);
  }, [lastText, speak]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* noop */ }
      controllerRef.current.setEnabled(next);
      if (!next) stop();
      return next;
    });
  }, [stop]);

  return { enabled, isLoading, isPlaying, lastText, speak, replay, stop, toggle };
}
