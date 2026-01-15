import { useState, useRef, useCallback, useEffect, useId } from 'react';
import type { Socket } from 'socket.io-client';

export interface DictationState {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  lastResult: string | null;
  partialResult: string | null; // For streaming mode
  duration: number | null;
  mode: 'batch' | 'streaming' | null;
}

// Timeout for processing state - if no result arrives, reset to idle
const PROCESSING_TIMEOUT_MS = 30000;

export interface UseDictationOptions {
  streaming?: boolean; // Request streaming mode (uses cloud API if available)
  onPartialResult?: (text: string) => void; // Callback for partial results
}

export interface UseDictationResult extends DictationState {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
}

// PCM Processor worklet code as a string (will be loaded as blob URL)
const pcmProcessorCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.bufferSize = 4096; // Send chunks of this size
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      // Convert float32 to int16
      const float32Data = input[0];
      for (let i = 0; i < float32Data.length; i++) {
        // Clamp and convert to int16
        const s = Math.max(-1, Math.min(1, float32Data[i]));
        this.buffer.push(s < 0 ? s * 0x8000 : s * 0x7FFF);
      }

      // Send buffer when it reaches target size
      if (this.buffer.length >= this.bufferSize) {
        const int16Array = new Int16Array(this.buffer.splice(0, this.bufferSize));
        this.port.postMessage(int16Array.buffer, [int16Array.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
`;

export function useDictation(
  socket: Socket | null,
  options: UseDictationOptions = {},
): UseDictationResult {
  const { streaming = false, onPartialResult } = options;

  // Unique ID for this hook instance to filter events
  const instanceId = useId();
  const activeSessionRef = useRef<string | null>(null);

  const [state, setState] = useState<DictationState>({
    isRecording: false,
    isProcessing: false,
    error: null,
    lastResult: null,
    partialResult: null,
    duration: null,
    mode: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cancelledSessionsRef = useRef<Set<string>>(new Set());

  // Socket event handlers
  useEffect(() => {
    if (!socket) return undefined;

    const handleStarted = ({ mode, dictationId }: { mode?: 'batch' | 'streaming'; dictationId?: string } = {}) => {
      // Only respond if this is our session and not cancelled
      if (dictationId && dictationId !== activeSessionRef.current) return;
      if (dictationId && cancelledSessionsRef.current.has(dictationId)) {
        // Session was cancelled before started event arrived - ignore
        cancelledSessionsRef.current.delete(dictationId);
        return;
      }
      setState(s => ({
        ...s,
        isRecording: true,
        error: null,
        mode: mode || 'batch',
        partialResult: null,
      }));
    };

    const handlePartial = ({ text, isFinal, dictationId }: { text: string; isFinal: boolean; dictationId?: string }) => {
      // Only respond if this is our session
      if (dictationId && dictationId !== activeSessionRef.current) return;
      setState(s => ({ ...s, partialResult: text }));
      if (!isFinal) {
        onPartialResult?.(text);
      }
    };

    const handleResult = ({ text, duration, dictationId }: { text: string; duration: number; dictationId?: string }) => {
      // Only respond if this is our session
      if (dictationId && dictationId !== activeSessionRef.current) return;
      // Ignore results from cancelled sessions
      if (dictationId && cancelledSessionsRef.current.has(dictationId)) {
        cancelledSessionsRef.current.delete(dictationId);
        return;
      }
      activeSessionRef.current = null; // Clear session after result
      // Clear processing timeout
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      setState(s => ({
        ...s,
        isProcessing: false,
        lastResult: text,
        partialResult: null,
        duration,
        error: null,
      }));
    };

    const handleError = ({ message, dictationId }: { message: string; dictationId?: string }) => {
      // Only respond if this is our session
      if (dictationId && dictationId !== activeSessionRef.current) return;
      // Ignore errors from cancelled sessions
      if (dictationId && cancelledSessionsRef.current.has(dictationId)) {
        cancelledSessionsRef.current.delete(dictationId);
        return;
      }
      activeSessionRef.current = null;
      // Clear processing timeout
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      setState(s => ({
        ...s,
        isRecording: false,
        isProcessing: false,
        error: message,
      }));
    };

    const handleCancelled = ({ dictationId }: { dictationId?: string } = {}) => {
      // Cancelled events are accepted even if activeSessionRef is already cleared
      // (since cancelRecording clears it optimistically)
      cancelledSessionsRef.current.delete(dictationId || '');
      // Clear processing timeout
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      setState(s => ({
        ...s,
        isRecording: false,
        isProcessing: false,
        partialResult: null,
      }));
    };

    // Handle socket disconnect - clean up recording state
    const handleDisconnect = () => {
      // Clear processing timeout
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      if (activeSessionRef.current) {
        activeSessionRef.current = null;
        setState(s => ({
          ...s,
          isRecording: false,
          isProcessing: false,
          partialResult: null,
          error: 'Connection lost',
        }));
      }
    };

    socket.on('dictation:started', handleStarted);
    socket.on('dictation:partial', handlePartial);
    socket.on('dictation:result', handleResult);
    socket.on('dictation:error', handleError);
    socket.on('dictation:cancelled', handleCancelled);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('dictation:started', handleStarted);
      socket.off('dictation:partial', handlePartial);
      socket.off('dictation:result', handleResult);
      socket.off('dictation:error', handleError);
      socket.off('dictation:cancelled', handleCancelled);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, onPartialResult]);

  const startRecording = useCallback(async () => {
    if (!socket) {
      setState(s => ({ ...s, error: 'Socket not connected' }));
      return;
    }

    // Check for secure context (HTTPS or localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      setState(s => ({ ...s, error: 'Microphone requires HTTPS or localhost' }));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Generate unique ID for this dictation session
      const dictationId = `${instanceId}-${Date.now()}`;
      activeSessionRef.current = dictationId;

      // Send start event with streaming preference and dictation ID
      socket.emit('dictation:start', { streaming, dictationId });

      if (streaming) {
        // Use AudioWorklet for raw PCM streaming (for cloud API)
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        // Create blob URL for worklet
        const blob = new Blob([pcmProcessorCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);

        await audioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
        workletNodeRef.current = workletNode;

        // Send PCM chunks to server
        workletNode.port.onmessage = (event) => {
          socket.emit('dictation:chunk', event.data, { pcm: true });
        };

        source.connect(workletNode);
        workletNode.connect(audioContext.destination);
      } else {
        // Use MediaRecorder for batch mode (webm/opus)
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });
        mediaRecorderRef.current = mediaRecorder;

        // Stream audio chunks to server
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            event.data.arrayBuffer().then((buffer) => {
              socket.emit('dictation:chunk', buffer);
            });
          }
        };

        // Start recording with 250ms chunks
        mediaRecorder.start(250);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access microphone';
      setState(s => ({ ...s, error: message }));
    }
  }, [socket, streaming, instanceId]);

  const cleanupAudio = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    cleanupAudio();
    setState(s => ({ ...s, isRecording: false, isProcessing: true }));
    socket?.emit('dictation:stop', { dictationId: activeSessionRef.current });

    // Set timeout to reset processing state if no result arrives
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    processingTimeoutRef.current = setTimeout(() => {
      processingTimeoutRef.current = null;
      // Only reset if still processing (result didn't arrive)
      setState(s => {
        if (s.isProcessing) {
          activeSessionRef.current = null;
          return {
            ...s,
            isProcessing: false,
            error: 'Transcription timed out',
          };
        }
        return s;
      });
    }, PROCESSING_TIMEOUT_MS);
  }, [socket, cleanupAudio]);

  const cancelRecording = useCallback(() => {
    cleanupAudio();

    // Clear processing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }

    // Track this session as cancelled to ignore late-arriving events
    const dictationId = activeSessionRef.current;
    if (dictationId) {
      cancelledSessionsRef.current.add(dictationId);
      // Clean up stale entries after a delay (in case server response never comes)
      setTimeout(() => {
        cancelledSessionsRef.current.delete(dictationId);
      }, 10000);
    }

    setState(s => ({ ...s, isRecording: false, isProcessing: false, partialResult: null }));
    socket?.emit('dictation:cancel', { dictationId });
    activeSessionRef.current = null;
  }, [socket, cleanupAudio]);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
