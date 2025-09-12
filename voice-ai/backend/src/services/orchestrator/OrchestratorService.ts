import { EventEmitter } from 'events';
import { STTService, STTConfig, TranscriptionResult } from '../stt/STTService';
import { TTSService, TTSConfig } from '../tts/TTSService';
import { Transform, PassThrough, pipeline, Readable } from 'stream';
import axios from 'axios';

// Orchestrator Configuration
export interface OrchestratorConfig {
  stt: STTConfig;
  tts: TTSConfig;
  llm: {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    model: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  };
  streamingMode?: boolean;
  bufferThreshold?: number; // Min text length before processing
}

// Conversation State
export interface ConversationTurn {
  id: string;
  timestamp: number;
  userInput: string;
  aiResponse: string;
  sttLatency?: number;
  llmLatency?: number;
  ttsLatency?: number;
  totalLatency?: number;
}

// Orchestrator Events
export interface OrchestratorEvents {
  'user-speaking': () => void;
  'user-stopped': () => void;
  'transcription': (text: string, isFinal: boolean) => void;
  'ai-thinking': () => void;
  'ai-response': (text: string) => void;
  'audio-ready': (audioStream: NodeJS.ReadableStream) => void;
  'turn-complete': (turn: ConversationTurn) => void;
  'error': (error: Error, stage: string) => void;
  'metrics': (metrics: PerformanceMetrics) => void;
}

// Performance Metrics
export interface PerformanceMetrics {
  turnId: string;
  sttStartTime: number;
  sttEndTime?: number;
  llmStartTime?: number;
  llmEndTime?: number;
  ttsStartTime?: number;
  ttsEndTime?: number;
  totalStartTime: number;
  totalEndTime?: number;
}

/**
 * Voice AI Orchestrator Service
 * Manages the complete audio pipeline: Audio → STT → LLM → TTS → Audio
 */
export class OrchestratorService extends EventEmitter {
  private config: OrchestratorConfig;
  private sttService: STTService;
  private ttsService: TTSService;
  private conversationHistory: ConversationTurn[] = [];
  private currentTranscription: string = '';
  private isProcessing: boolean = false;
  private metrics?: PerformanceMetrics;
  private currentAudioStream?: Transform;

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.sttService = new STTService(config.stt);
    this.ttsService = new TTSService(config.tts);
    
    // Set up STT event handlers
    this.setupSTTHandlers();
  }

  /**
   * Create a duplex stream for WebRTC integration
   */
  createDuplexStream(): Transform {
    const duplexStream = new Transform({
      transform: async (chunk, encoding, callback) => {
        // Process incoming audio through STT
        if (this.currentAudioStream) {
          this.currentAudioStream.write(chunk);
        }
        callback();
      }
    });

    // When TTS audio is ready, pipe it back through the duplex stream
    this.on('audio-ready', (audioStream: Readable) => {
      audioStream.on('data', (chunk) => {
        duplexStream.push(chunk);
      });
      audioStream.on('end', () => {
        // Don't end the duplex stream, just this audio segment
      });
    });

    return duplexStream;
  }

  /**
   * Set up STT event handlers
   */
  private setupSTTHandlers(): void {
    this.sttService.on('transcription', async (result: TranscriptionResult) => {
      this.emit('transcription', result.text, result.isFinal);
      
      if (result.isFinal) {
        this.currentTranscription += ' ' + result.text;
        
        // Process if we have enough text or streaming is disabled
        if (!this.config.streamingMode || 
            this.currentTranscription.length >= (this.config.bufferThreshold || 50)) {
          await this.processTranscription(this.currentTranscription.trim());
          this.currentTranscription = '';
        }
      } else if (this.config.streamingMode) {
        // For interim results in streaming mode
        this.currentTranscription = result.text;
      }
    });

    this.sttService.on('error', (error) => {
      this.emit('error', error, 'stt');
    });

    this.sttService.on('connected', () => {
      console.log('STT service connected');
    });

    this.sttService.on('end', () => {
      // Process any remaining transcription
      if (this.currentTranscription.trim()) {
        this.processTranscription(this.currentTranscription.trim());
        this.currentTranscription = '';
      }
      this.emit('user-stopped');
    });
  }

  /**
   * Start processing audio stream
   */
  async startProcessing(audioStream: NodeJS.ReadableStream): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Already processing audio');
    }

    this.isProcessing = true;
    this.emit('user-speaking');

    // Initialize metrics
    const turnId = `turn_${Date.now()}`;
    this.metrics = {
      turnId,
      totalStartTime: Date.now(),
      sttStartTime: Date.now(),
    };

    try {
      // Start STT streaming
      const sttTransform = await this.sttService.startStreaming({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm',
      });

      // Store the transform for duplex stream usage
      this.currentAudioStream = sttTransform;

      // Pipe audio through STT
      audioStream.pipe(sttTransform);

    } catch (error) {
      this.isProcessing = false;
      this.emit('error', error as Error, 'orchestrator');
      throw error;
    }
  }

  /**
   * Stop processing
   */
  stopProcessing(): void {
    if (this.isProcessing) {
      this.sttService.stopStreaming();
      this.isProcessing = false;
      this.currentAudioStream = undefined;
    }
  }

  /**
   * Process transcription through LLM and TTS
   */
  private async processTranscription(text: string): Promise<void> {
    if (!text || text.length < 3) return;

    console.log('[Orchestrator] Processing transcription:', text);
    
    // Update metrics
    if (this.metrics) {
      this.metrics.sttEndTime = Date.now();
      this.metrics.llmStartTime = Date.now();
    }

    this.emit('ai-thinking');

    try {
      // Get LLM response
      const aiResponse = await this.getLLMResponse(text);
      
      if (this.metrics) {
        this.metrics.llmEndTime = Date.now();
        this.metrics.ttsStartTime = Date.now();
      }

      this.emit('ai-response', aiResponse);

      // Generate speech
      const audioStream = await this.ttsService.processTextToSpeech(aiResponse);
      
      if (this.metrics) {
        this.metrics.ttsEndTime = Date.now();
        this.metrics.totalEndTime = Date.now();
      }

      this.emit('audio-ready', audioStream);

      // Record conversation turn
      const turn: ConversationTurn = {
        id: this.metrics?.turnId || `turn_${Date.now()}`,
        timestamp: Date.now(),
        userInput: text,
        aiResponse: aiResponse,
        sttLatency: this.metrics ? this.metrics.sttEndTime! - this.metrics.sttStartTime : undefined,
        llmLatency: this.metrics ? this.metrics.llmEndTime! - this.metrics.llmStartTime! : undefined,
        ttsLatency: this.metrics ? this.metrics.ttsEndTime! - this.metrics.ttsStartTime! : undefined,
        totalLatency: this.metrics ? this.metrics.totalEndTime! - this.metrics.totalStartTime : undefined,
      };

      this.conversationHistory.push(turn);
      this.emit('turn-complete', turn);
      this.emit('metrics', this.metrics!);

      // Log performance metrics
      console.log('[Orchestrator] Turn complete:', {
        turnId: turn.id,
        sttLatency: `${turn.sttLatency}ms`,
        llmLatency: `${turn.llmLatency}ms`,
        ttsLatency: `${turn.ttsLatency}ms`,
        totalLatency: `${turn.totalLatency}ms`,
      });

    } catch (error) {
      console.error('[Orchestrator] Error processing transcription:', error);
      this.emit('error', error as Error, 'processing');
    }
  }

  /**
   * Get LLM response
   */
  protected async getLLMResponse(userInput: string): Promise<string> {
    const { llm } = this.config;

    // Build conversation context
    const messages = [
      {
        role: 'system',
        content: llm.systemPrompt || 'You are a helpful voice assistant. Keep responses concise and conversational.',
      },
      // Include recent conversation history
      ...this.conversationHistory.slice(-5).flatMap(turn => [
        { role: 'user', content: turn.userInput },
        { role: 'assistant', content: turn.aiResponse },
      ]),
      { role: 'user', content: userInput },
    ];

    try {
      if (llm.provider === 'openai') {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: llm.model || 'gpt-4',
            messages,
            temperature: llm.temperature || 0.7,
            max_tokens: llm.maxTokens || 150,
            stream: false,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${llm.apiKey}`,
            },
          }
        );

        return response.data.choices[0].message.content;
      } else {
        throw new Error(`LLM provider ${llm.provider} not implemented`);
      }
    } catch (error: any) {
      console.error('[Orchestrator] LLM error:', error);
      throw new Error(`LLM request failed: ${error.message}`);
    }
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): ConversationTurn[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get average latencies
   */
  getAverageLatencies(): {
    stt: number;
    llm: number;
    tts: number;
    total: number;
  } {
    if (this.conversationHistory.length === 0) {
      return { stt: 0, llm: 0, tts: 0, total: 0 };
    }

    const totals = this.conversationHistory.reduce(
      (acc, turn) => ({
        stt: acc.stt + (turn.sttLatency || 0),
        llm: acc.llm + (turn.llmLatency || 0),
        tts: acc.tts + (turn.ttsLatency || 0),
        total: acc.total + (turn.totalLatency || 0),
      }),
      { stt: 0, llm: 0, tts: 0, total: 0 }
    );

    const count = this.conversationHistory.length;
    return {
      stt: Math.round(totals.stt / count),
      llm: Math.round(totals.llm / count),
      tts: Math.round(totals.tts / count),
      total: Math.round(totals.total / count),
    };
  }

}

// Factory function
export function createOrchestrator(config: OrchestratorConfig): OrchestratorService {
  return new OrchestratorService(config);
}