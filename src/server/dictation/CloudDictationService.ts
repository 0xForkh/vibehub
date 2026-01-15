import {
  ElevenLabsClient,
  AudioFormat,
  RealtimeEvents,
} from '@elevenlabs/elevenlabs-js';
import { logger as getLogger } from '../../shared/logger.js';

const {ELEVENLABS_API_KEY} = process.env;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RealtimeConnection = any;

export class CloudDictationService {
  private logger = getLogger();

  private client: ElevenLabsClient | null = null;

  private connection: RealtimeConnection = null;

  private isReady = false;

  private onTranscript: ((text: string, isFinal: boolean) => void) | null = null;

  private onError: ((error: string) => void) | null = null;

  // eslint-disable-next-line class-methods-use-this
  isAvailable(): boolean {
    return !!ELEVENLABS_API_KEY;
  }

  async connect(
    onTranscript: (text: string, isFinal: boolean) => void,
    onError: (error: string) => void,
  ): Promise<void> {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not set');
    }

    this.onTranscript = onTranscript;
    this.onError = onError;
    this.isReady = false;

    this.client = new ElevenLabsClient({
      apiKey: ELEVENLABS_API_KEY,
    });

    this.connection = await this.client.speechToText.realtime.connect({
      modelId: 'scribe_v2_realtime',
      audioFormat: AudioFormat.PCM_16000,
      sampleRate: 16000,
    });

    // Set up event handlers
    this.connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data: { text?: string }) => {
      if (data.text) {
        this.onTranscript?.(data.text, false);
      }
    });

    this.connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data: { text?: string }) => {
      if (data.text) {
        this.onTranscript?.(data.text, true);
      }
    });

    this.connection.on(RealtimeEvents.CLOSE, () => {
      this.logger.info('ElevenLabs connection closed');
      this.isReady = false;
      this.connection = null;
    });

    // Wait for session to be ready before resolving
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('ElevenLabs connection timeout'));
      }, 10000);

      this.connection.on(RealtimeEvents.SESSION_STARTED, () => {
        clearTimeout(timeout);
        this.logger.info('ElevenLabs session started');
        this.isReady = true;
        resolve();
      });

      // Single error handler for both connection and runtime errors
      this.connection.on(RealtimeEvents.ERROR, (error: unknown) => {
        // Ignore commit_throttled - it's not a real error
        const errorObj = error as { message_type?: string };
        if (errorObj?.message_type === 'commit_throttled') {
          this.logger.debug('Commit throttled (not enough audio)', { error });
          return;
        }

        this.logger.error('ElevenLabs error', { error });

        // Only reject if not yet ready (during connection)
        if (!this.isReady) {
          clearTimeout(timeout);
          reject(new Error(String(error)));
        } else {
          this.onError?.(String(error));
        }
      });
    });
  }

  /**
   * Send audio chunk (PCM s16le 16kHz mono)
   */
  sendAudio(pcmBuffer: Buffer): void {
    if (!this.connection || !this.isReady) {
      // Silently drop audio if not ready - this can happen during startup
      return;
    }

    try {
      this.connection.send({
        audioBase64: pcmBuffer.toString('base64'),
      });
    } catch (err) {
      this.logger.warn('Failed to send audio', { err });
    }
  }

  /**
   * Commit audio buffer to force transcription
   */
  commit(): void {
    if (!this.connection) {
      return;
    }

    this.connection.commit();
  }

  disconnect(): void {
    if (this.connection) {
      try {
        this.connection.close();
      } catch {
        // Ignore errors when closing
      }
      this.connection = null;
    }
    this.client = null;
    this.onTranscript = null;
    this.onError = null;
  }
}
