import axios from 'axios';
import WebSocket from 'ws';
import { Readable, Transform } from 'stream';
import { EventEmitter } from 'events';

// STT Provider Enums
export enum STTProvider {
  OPENAI = 'openai',
  AZURE_SPEECH = 'azureSpeech',
  GOOGLE_SPEECH = 'googleSpeech',
  ASSEMBLYAI = 'assemblyai',
  DEEPGRAM = 'deepgram',
}

// Transcription Interfaces
export interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence?: number;
  timestamp?: number;
  language?: string;
  words?: Word[];
}

export interface Word {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface STTConfig {
  provider: STTProvider;
  apiKey: string;
  language?: string;
  model?: string;
  enhancedModel?: boolean;
  profanityFilter?: boolean;
  punctuation?: boolean;
  interimResults?: boolean;
}

export interface StreamingOptions {
  sampleRate?: number;
  channels?: number;
  encoding?: 'pcm' | 'opus' | 'flac';
  chunkSize?: number;
}

// STT Service Event Types
export interface STTServiceEvents {
  'transcription': (result: TranscriptionResult) => void;
  'error': (error: Error) => void;
  'end': () => void;
  'connected': () => void;
  'disconnected': () => void;
}

/**
 * Streaming Speech-to-Text Service
 * Supports multiple providers with real-time transcription
 */
export class STTService extends EventEmitter {
  private config: STTConfig;
  private ws?: WebSocket;
  private isStreaming: boolean = false;

  constructor(config: STTConfig) {
    super();
    this.config = config;
  }

  /**
   * Start streaming transcription
   */
  async startStreaming(options: StreamingOptions = {}): Promise<Transform> {
    if (this.isStreaming) {
      throw new Error('Streaming already in progress');
    }

    this.isStreaming = true;

    switch (this.config.provider) {
      case STTProvider.OPENAI:
        return this.startOpenAIStreaming(options);
      case STTProvider.DEEPGRAM:
        return this.startDeepgramStreaming(options);
      case STTProvider.ASSEMBLYAI:
        return this.startAssemblyAIStreaming(options);
      default:
        throw new Error(`Provider ${this.config.provider} not implemented yet`);
    }
  }

  /**
   * Stop streaming transcription
   */
  stopStreaming(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.isStreaming = false;
    this.emit('end');
  }

  /**
   * OpenAI Whisper streaming implementation
   * Note: OpenAI Whisper doesn't support real-time streaming yet,
   * so we'll implement chunked processing
   */
  private async startOpenAIStreaming(options: StreamingOptions): Promise<Transform> {
    const CHUNK_DURATION_MS = 2000; // 2 seconds chunks
    let audioBuffer: Buffer[] = [];
    let lastProcessTime = Date.now();

    const transform = new Transform({
      transform: async (chunk: Buffer, encoding, callback) => {
        audioBuffer.push(chunk);
        
        // Process chunk every 2 seconds
        if (Date.now() - lastProcessTime > CHUNK_DURATION_MS) {
          const audioData = Buffer.concat(audioBuffer);
          audioBuffer = [];
          lastProcessTime = Date.now();

          try {
            const transcription = await this.processOpenAIChunk(audioData, options);
            if (transcription) {
              this.emit('transcription', {
                text: transcription,
                isFinal: false,
                timestamp: Date.now(),
              });
            }
          } catch (error) {
            console.error('OpenAI chunk processing error:', error);
            this.emit('error', error as Error);
          }
        }
        
        callback(null, chunk);
      },
      
      flush: async (callback) => {
        // Process remaining audio
        if (audioBuffer.length > 0) {
          const audioData = Buffer.concat(audioBuffer);
          try {
            const transcription = await this.processOpenAIChunk(audioData, options);
            if (transcription) {
              this.emit('transcription', {
                text: transcription,
                isFinal: true,
                timestamp: Date.now(),
              });
            }
          } catch (error) {
            console.error('OpenAI final chunk error:', error);
            this.emit('error', error as Error);
          }
        }
        callback();
        this.emit('end');
      }
    });

    this.emit('connected');
    return transform;
  }

  /**
   * Process audio chunk with OpenAI Whisper
   */
  private async processOpenAIChunk(audioData: Buffer, options: StreamingOptions): Promise<string | null> {
    if (audioData.length === 0) return null;

    const formData = new FormData();
    const audioBlob = new Blob([audioData as any], { type: 'audio/wav' });
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', this.config.model || 'whisper-1');
    
    if (this.config.language) {
      formData.append('language', this.config.language);
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
        }
      );

      return response.data.text;
    } catch (error) {
      console.error('OpenAI transcription error:', error);
      throw error;
    }
  }

  /**
   * Deepgram WebSocket streaming implementation
   */
  private async startDeepgramStreaming(options: StreamingOptions): Promise<Transform> {
    const {
      sampleRate = 16000,
      channels = 1,
      encoding = 'pcm',
    } = options;

    // Build Deepgram URL with parameters
    const params = new URLSearchParams({
      encoding,
      sample_rate: sampleRate.toString(),
      channels: channels.toString(),
      language: this.config.language || 'en',
      model: this.config.model || 'nova-2',
      punctuate: this.config.punctuation ? 'true' : 'false',
      interim_results: this.config.interimResults ? 'true' : 'false',
      profanity_filter: this.config.profanityFilter ? 'true' : 'false',
      smart_format: 'true',
      utterance_end_ms: '1000',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    // Create WebSocket connection
    this.ws = new WebSocket(url, {
      headers: {
        'Authorization': `Token ${this.config.apiKey}`,
      },
    });

    // Handle WebSocket events
    this.ws.on('open', () => {
      console.log('Deepgram WebSocket connected');
      this.emit('connected');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());
        
        if (response.channel?.alternatives?.[0]) {
          const alternative = response.channel.alternatives[0];
          const result: TranscriptionResult = {
            text: alternative.transcript,
            isFinal: response.is_final || false,
            confidence: alternative.confidence,
            timestamp: Date.now(),
            words: alternative.words?.map((w: any) => ({
              text: w.word,
              start: w.start,
              end: w.end,
              confidence: w.confidence,
            })),
          };

          if (result.text.trim()) {
            this.emit('transcription', result);
          }
        }
      } catch (error) {
        console.error('Deepgram message parsing error:', error);
        this.emit('error', error as Error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('Deepgram WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('Deepgram WebSocket disconnected');
      this.emit('disconnected');
      this.isStreaming = false;
    });

    // Create transform stream that sends audio to WebSocket
    const transform = new Transform({
      transform: (chunk: Buffer, encoding, callback) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(chunk);
        }
        callback(null, chunk);
      },
    });

    return transform;
  }

  /**
   * AssemblyAI WebSocket streaming implementation
   */
  private async startAssemblyAIStreaming(options: StreamingOptions): Promise<Transform> {
    const {
      sampleRate = 16000,
    } = options;

    // First, create a temporary token for real-time streaming
    const tokenResponse = await axios.post(
      'https://api.assemblyai.com/v2/realtime/token',
      { expires_in: 3600 }, // 1 hour expiry
      {
        headers: {
          'Authorization': this.config.apiKey,
        },
      }
    );

    const { token } = tokenResponse.data;

    // Connect to AssemblyAI WebSocket
    const url = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=${sampleRate}&token=${token}`;
    
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('AssemblyAI WebSocket connected');
      this.emit('connected');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());
        
        if (response.message_type === 'PartialTranscript' || response.message_type === 'FinalTranscript') {
          const result: TranscriptionResult = {
            text: response.text,
            isFinal: response.message_type === 'FinalTranscript',
            confidence: response.confidence,
            timestamp: Date.now(),
            words: response.words?.map((w: any) => ({
              text: w.text,
              start: w.start,
              end: w.end,
              confidence: w.confidence,
            })),
          };

          if (result.text.trim()) {
            this.emit('transcription', result);
          }
        }
      } catch (error) {
        console.error('AssemblyAI message parsing error:', error);
        this.emit('error', error as Error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('AssemblyAI WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('AssemblyAI WebSocket disconnected');
      this.emit('disconnected');
      this.isStreaming = false;
    });

    // Create transform stream
    const transform = new Transform({
      transform: (chunk: Buffer, encoding, callback) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          // AssemblyAI expects base64 encoded audio
          const base64Audio = chunk.toString('base64');
          this.ws.send(JSON.stringify({
            audio_data: base64Audio,
          }));
        }
        callback(null, chunk);
      },
      
      flush: (callback) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          // Send termination message
          this.ws.send(JSON.stringify({ terminate_session: true }));
        }
        callback();
      }
    });

    return transform;
  }

  /**
   * Process a single audio file (non-streaming)
   */
  async transcribeFile(audioBuffer: Buffer, mimeType: string = 'audio/wav'): Promise<TranscriptionResult> {
    switch (this.config.provider) {
      case STTProvider.OPENAI:
        return this.transcribeFileOpenAI(audioBuffer, mimeType);
      case STTProvider.ASSEMBLYAI:
        return this.transcribeFileAssemblyAI(audioBuffer, mimeType);
      default:
        throw new Error(`File transcription not implemented for ${this.config.provider}`);
    }
  }

  /**
   * OpenAI file transcription
   */
  private async transcribeFileOpenAI(audioBuffer: Buffer, mimeType: string): Promise<TranscriptionResult> {
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer as any], { type: mimeType });
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', this.config.model || 'whisper-1');
    formData.append('response_format', 'verbose_json');
    
    if (this.config.language) {
      formData.append('language', this.config.language);
    }

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      }
    );

    return {
      text: response.data.text,
      isFinal: true,
      language: response.data.language,
      timestamp: Date.now(),
    };
  }

  /**
   * AssemblyAI file transcription
   */
  private async transcribeFileAssemblyAI(audioBuffer: Buffer, mimeType: string): Promise<TranscriptionResult> {
    // Upload file
    const uploadResponse = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      audioBuffer,
      {
        headers: {
          'Authorization': this.config.apiKey,
          'Content-Type': mimeType,
        },
      }
    );

    const { upload_url } = uploadResponse.data;

    // Create transcription job
    const transcriptResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: upload_url,
        language_code: this.config.language || 'en',
        punctuate: this.config.punctuation,
        format_text: true,
      },
      {
        headers: {
          'Authorization': this.config.apiKey,
        },
      }
    );

    const { id } = transcriptResponse.data;

    // Poll for result
    let result;
    while (true) {
      const statusResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${id}`,
        {
          headers: {
            'Authorization': this.config.apiKey,
          },
        }
      );

      if (statusResponse.data.status === 'completed') {
        result = statusResponse.data;
        break;
      } else if (statusResponse.data.status === 'error') {
        throw new Error(`Transcription failed: ${statusResponse.data.error}`);
      }

      // Wait 1 second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      text: result.text,
      isFinal: true,
      confidence: result.confidence,
      language: result.language_code,
      timestamp: Date.now(),
      words: result.words?.map((w: any) => ({
        text: w.text,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
      })),
    };
  }
}

// Export factory function
export function createSTTService(config: STTConfig): STTService {
  return new STTService(config);
}