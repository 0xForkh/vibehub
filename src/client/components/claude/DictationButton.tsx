import { Mic, MicOff, Loader2, Zap, X } from 'lucide-react';
import React, { useEffect, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { useDictation } from '../../hooks/useDictation';

interface DictationButtonProps {
  socket: Socket | null;
  onResult?: (text: string) => void;
  onSend?: () => void; // Called when dictation should trigger send
  onPartialResult?: (text: string) => void;
  disabled?: boolean;
  streaming?: boolean;
}

// Detect mobile/touch device - evaluated once at module load
const IS_TOUCH_DEVICE = typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export function DictationButton({
  socket,
  onResult,
  onSend,
  onPartialResult,
  disabled = false,
  streaming = false,
}: DictationButtonProps) {
  const {
    isRecording,
    isProcessing,
    error,
    lastResult,
    partialResult,
    duration,
    mode,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useDictation(socket, { streaming, onPartialResult });

  const lastProcessedRef = useRef<string | null>(null);
  const hotkeyActiveRef = useRef(false);
  const pendingSendRef = useRef(false);
  const isStartingRef = useRef(false); // Prevent multiple startRecording calls

  // Call onResult when we get a NEW transcription
  useEffect(() => {
    if (lastResult && onResult && lastResult !== lastProcessedRef.current) {
      lastProcessedRef.current = lastResult;
      onResult(lastResult);

      // If send was pending (from hold-to-talk release), trigger it after result
      if (pendingSendRef.current) {
        pendingSendRef.current = false;
        // Small delay to ensure state updates
        setTimeout(() => onSend?.(), 50);
      }
    }
  }, [lastResult, onResult, onSend]);

  // Clear starting flag when recording state changes
  // Note: Don't clear pendingSendRef here - it's cleared after send is triggered in the lastResult effect
  useEffect(() => {
    if (isRecording) {
      isStartingRef.current = false; // Recording started successfully
    }
    if (!isRecording && !isProcessing) {
      isStartingRef.current = false;
    }
  }, [isRecording, isProcessing]);

  // Wrapper to prevent multiple concurrent startRecording calls
  const safeStartRecording = useCallback(() => {
    if (isStartingRef.current || isRecording || isProcessing) {
      return;
    }
    isStartingRef.current = true;
    startRecording();
  }, [isRecording, isProcessing, startRecording]);

  // Desktop: Global hotkey handler (Ctrl+Space to start, hold Space to continue, release to send)
  useEffect(() => {
    if (disabled || IS_TOUCH_DEVICE) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore repeated keydown events (key held down)
      if (e.repeat) return;

      // Ignore if in input/textarea (unless already recording via hotkey)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Ctrl+Space to start recording
      if (e.code === 'Space' && e.ctrlKey && !isRecording && !isProcessing) {
        e.preventDefault();
        hotkeyActiveRef.current = true;
        safeStartRecording();
        return;
      }

      // Space (without Ctrl) to continue holding while recording via hotkey
      if (e.code === 'Space' && !e.ctrlKey && isRecording && hotkeyActiveRef.current) {
        e.preventDefault();
        return;
      }

      // Escape to cancel
      if (e.key === 'Escape' && isRecording) {
        e.preventDefault();
        hotkeyActiveRef.current = false;
        cancelRecording();
        return;
      }

      // Enter to stop and send (click-to-start mode, not holding)
      if (e.key === 'Enter' && isRecording && !hotkeyActiveRef.current && !isInput) {
        e.preventDefault();
        pendingSendRef.current = true;
        stopRecording();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Release Space while recording via hotkey -> stop and send
      if (e.code === 'Space' && isRecording && hotkeyActiveRef.current) {
        e.preventDefault();
        hotkeyActiveRef.current = false;
        pendingSendRef.current = true;
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [disabled, isRecording, isProcessing, safeStartRecording, stopRecording, cancelRecording]);

  // Click/tap to start recording, click/tap again to stop and send
  const handleClick = useCallback(() => {
    if (isRecording) {
      // Click while recording = stop and send
      pendingSendRef.current = true;
      stopRecording();
    } else if (!isProcessing) {
      safeStartRecording();
    }
  }, [isRecording, isProcessing, safeStartRecording, stopRecording]);

  const handleCancelClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    hotkeyActiveRef.current = false;
    cancelRecording();
  }, [cancelRecording]);

  const isStreaming = mode === 'streaming';
  const isMobile = IS_TOUCH_DEVICE;

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isProcessing}
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border transition-all ${
          isRecording
            ? isStreaming
              ? 'animate-pulse border-purple-500 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
              : 'animate-pulse border-red-500 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
            : isProcessing
            ? 'border-yellow-500 bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
            : 'border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
        } disabled:opacity-50`}
        title={
          isRecording
            ? 'Tap to send (or use cancel button)'
            : isProcessing
            ? 'Processing...'
            : isMobile
            ? 'Tap to start recording'
            : 'Click to record or Ctrl+Space (hold Space, release to send)'
        }
      >
        {isProcessing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-5 w-5" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>

      {/* Cancel button - shown when recording OR processing */}
      {(isRecording || isProcessing) && (
        <button
          type="button"
          onClick={handleCancelClick}
          onTouchEnd={handleCancelClick}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-red-300 bg-red-50 text-red-600 transition-all hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
          title={isProcessing ? 'Cancel processing' : 'Cancel recording'}
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <span className="absolute -right-1 -top-1 flex h-3 w-3">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isStreaming ? 'bg-purple-400' : 'bg-red-400'}`}></span>
          <span className={`relative inline-flex h-3 w-3 rounded-full ${isStreaming ? 'bg-purple-500' : 'bg-red-500'}`}></span>
        </span>
      )}

      {/* Streaming indicator */}
      {isStreaming && isRecording && (
        <span className="absolute -left-1 -top-1">
          <Zap className="h-3 w-3 text-purple-500" />
        </span>
      )}

      {/* Partial result tooltip (streaming mode) */}
      {partialResult && isRecording && (
        <div className="fixed bottom-20 left-1/2 z-50 max-w-[80vw] -translate-x-1/2 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white shadow-lg">
          {partialResult}
        </div>
      )}

      {/* Error tooltip */}
      {error && (
        <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-red-600 px-2 py-1 text-xs text-white">
          {error}
        </div>
      )}

      {/* Duration tooltip (shown briefly after result) */}
      {duration !== null && duration > 0 && !isRecording && !isProcessing && (
        <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-green-600 px-2 py-1 text-xs text-white">
          {(duration / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}
