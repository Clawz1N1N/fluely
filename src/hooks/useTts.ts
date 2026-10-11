import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface TtsState {
  enabled: boolean;
  speaking: boolean;
  paused: boolean;
  currentWord: string;
  currentIndex: number;
  voices: SpeechSynthesisVoice[];
  rate: number;
}

/**
 * TTS manager using the Web Speech API (system voices).
 *
 * Highlights the currently spoken word using
 * boundary events (charIndex) when the voice supports
 * them; otherwise estimates from audio duration.
 *
 * Controls: play, pause/resume, stop, seek by sentence,
 * rate, and a master disable switch (persisted in Rust).
 */
export function useTts() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentWord, setCurrentWord] = useState("");
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sentencesRef = useRef<string[]>([]);
  const sentenceIdxRef = useRef(0);

  // Load persisted settings.
  useEffect(() => {
    invoke<{
      enabled: boolean;
      rate: number;
      language: string;
      voice: string;
    }>("get_tts_settings")
      .then((s) => {
        setEnabled(s.enabled);
        setRate(s.rate);
      })
      .catch(() => {});
  }, []);

  // Populate voices.
  const loadVoices = useCallback(() => {
    const voices = window.speechSynthesis?.getVoices() ?? [];
    return voices;
  }, []);

  useEffect(() => {
    loadVoices();
    const id = window.setInterval(loadVoices, 1000);
    return () => window.clearInterval(id);
  }, [loadVoices]);

  const speakSentence = useCallback(
    (text: string, onBoundary?: (index: number, word: string) => void) => {
      if (!enabled) return;
      const synth = window.speechSynthesis;
      if (!synth) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = rate;
      if (voice) utter.voice = voice;
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => {
        setSpeaking(false);
        setCurrentWord("");
        setCurrentIndex(-1);
      };
      utter.onerror = () => {
        setSpeaking(false);
      };
      // Boundary events give the spoken word + char index.
      utter.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name === "word" || event.name === "sentence") {
          const charIndex = event.charIndex ?? 0;
          const word = extractWordAt(text, charIndex);
          setCurrentWord(word);
          setCurrentIndex(charIndex);
          onBoundary?.(charIndex, word);
        }
      };
      utterRef.current = utter;
      synth.speak(utter);
    },
    [enabled, rate, voice]
  );

  /** Speak the full <speak> text, sentence by sentence. */
  const speak = useCallback(
    (text: string) => {
      stop();
      if (!enabled) return;
      const sentences = text
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.trim().length > 0);
      sentencesRef.current = sentences;
      sentenceIdxRef.current = 0;
      if (sentences.length === 0) return;
      speakSentence(sentences[0], (idx, word) => {
        setCurrentWord(word);
        setCurrentIndex(idx);
      });
      // Chain sentences: when one ends, start the next.
      const utter = utterRef.current;
      if (utter) {
        utter.onend = () => {
          sentenceIdxRef.current += 1;
          const next = sentencesRef.current[sentenceIdxRef.current];
          if (next) {
            speakSentence(next);
          } else {
            setSpeaking(false);
          }
        };
      }
    },
    [enabled, speakSentence]
  );

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setPaused(false);
    setCurrentWord("");
    setCurrentIndex(-1);
    sentenceIdxRef.current = 0;
  }, []);

  const pause = useCallback(() => {
    window.speechSynthesis?.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis?.resume();
    setPaused(false);
  }, []);

  /** Seek back/forward by one sentence. */
  const seek = useCallback(
    (delta: number) => {
      const sentences = sentencesRef.current;
      if (sentences.length === 0) return;
      let next = sentenceIdxRef.current + delta;
      next = Math.max(0, Math.min(sentences.length - 1, next));
      sentenceIdxRef.current = next;
      window.speechSynthesis?.cancel();
      speakSentence(sentences[next]);
    },
    [speakSentence]
  );

  /** Master toggle: disables TTS entirely. */
  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (!next) {
        window.speechSynthesis?.cancel();
        setSpeaking(false);
      }
      invoke("set_tts_enabled", { enabled: next }).catch(() => {});
      return next;
    });
  }, []);

  return {
    enabled,
    speaking,
    paused,
    currentWord,
    currentIndex,
    voices: loadVoices(),
    rate,
    setRate,
    voice,
    setVoice,
    speak,
    stop,
    pause,
    resume,
    seek,
    toggle,
  };
}

function extractWordAt(text: string, charIndex: number): string {
  const start = text.lastIndexOf(" ", charIndex) + 1;
  let end = text.indexOf(" ", charIndex);
  if (end === -1) end = text.length;
  return text.slice(start, end);
}
