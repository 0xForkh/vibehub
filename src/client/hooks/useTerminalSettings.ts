import { useState, useEffect } from 'react';

const STORAGE_KEY = 'vibehub-terminal-fontSize';
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 32;

export function useTerminalSettings() {
  const [fontSize, setFontSizeState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load font size from localStorage:', err);
    }
    return DEFAULT_FONT_SIZE;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, fontSize.toString());
    } catch (err) {
      console.error('Failed to save font size to localStorage:', err);
    }
  }, [fontSize]);

  const setFontSize = (size: number) => {
    const clampedSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
    setFontSizeState(clampedSize);
  };

  const increaseFontSize = () => {
    setFontSize(fontSize + 2);
  };

  const decreaseFontSize = () => {
    setFontSize(fontSize - 2);
  };

  return {
    fontSize,
    setFontSize,
    increaseFontSize,
    decreaseFontSize,
    minFontSize: MIN_FONT_SIZE,
    maxFontSize: MAX_FONT_SIZE,
  };
}
