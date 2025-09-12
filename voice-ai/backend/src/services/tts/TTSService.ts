import axios, { AxiosResponse } from 'axios';
import { Readable } from 'stream';

// TTS Provider Enums
export enum TTSProvider {
  OPENAI = 'openai',
  AZURE_OPENAI = 'azureOpenAI',
  ELEVENLABS = 'elevenlabs',
  LOCALAI = 'localai',
}

// Voice Settings Interface
export interface VoiceSettings {
  similarity_boost?: number;
  stability?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

// TTS Configuration Interfaces
export interface TTSProviderConfig {
  url?: string;
  apiKey: string;
  model?: string;
  voices: string[];
  defaultVoice?: string;
  voice_settings?: VoiceSettings;
}

export interface OpenAIConfig extends TTSProviderConfig {
  backend?: string;
}

export interface AzureOpenAIConfig extends TTSProviderConfig {
  instanceName: string;
  deploymentName: string;
  apiVersion: string;
}

export interface ElevenLabsConfig extends TTSProviderConfig {
  pronunciation_dictionary_locators?: string[];
}

export interface LocalAIConfig extends TTSProviderConfig {
  backend?: string;
}

export interface TTSConfig {
  provider: TTSProvider;
  openai?: OpenAIConfig;
  azureOpenAI?: AzureOpenAIConfig;
  elevenlabs?: ElevenLabsConfig;
  localai?: LocalAIConfig;
}

// Text Chunk Interface
export interface TextChunk {
  text: string;
  isFinished: boolean;
}

// TTS Request Options
export interface TTSRequestOptions {
  input: string;
  voice: string;
  stream?: boolean;
}

// Audio Stream Options
export interface AudioStreamOptions {
  messageId: string;
  voice?: string;
  onChunkProcessed?: (chunk: TextChunk) => void;
}

// Separators for text chunking
const SEPARATORS = ['.', '!', '?', '\n', '。', '！', '？'];

/**
 * TTS Service for handling Text-to-Speech operations
 * Extracted and modernized from LibreChat
 */
type ProviderStrategy = (config: any, input: string, voice: string, stream?: boolean) => [string, any, any];

export class TTSService {
  private config: TTSConfig;
  private providerStrategies: Map<TTSProvider, ProviderStrategy>;

  constructor(config: TTSConfig) {
    this.config = config;
    this.providerStrategies = new Map<TTSProvider, ProviderStrategy>([
      [TTSProvider.OPENAI, this.openAIProvider.bind(this)],
      [TTSProvider.AZURE_OPENAI, this.azureOpenAIProvider.bind(this)],
      [TTSProvider.ELEVENLABS, this.elevenLabsProvider.bind(this)],
      [TTSProvider.LOCALAI, this.localAIProvider.bind(this)],
    ]);
  }

  /**
   * Get the active provider configuration
   */
  getActiveProviderConfig(): TTSProviderConfig | undefined {
    const provider = this.config.provider;
    return this.config[provider] as TTSProviderConfig;
  }

  /**
   * Select a voice based on configuration and request
   */
  async getVoice(requestVoice?: string): Promise<string> {
    const providerConfig = this.getActiveProviderConfig();
    if (!providerConfig) {
      throw new Error(`No configuration found for provider: ${this.config.provider}`);
    }

    const voices = providerConfig.voices.filter(
      (voice) => voice && voice.toUpperCase() !== 'ALL'
    );

    let voice = requestVoice;
    
    if (!voice || !voices.includes(voice) || (voice.toUpperCase() === 'ALL' && voices.length > 1)) {
      voice = providerConfig.defaultVoice || voices[0];
      
      if (!voices.includes(voice)) {
        console.warn(`Default voice "${voice}" not in available voices, using first voice: ${voices[0]}`);
        voice = voices[0];
      }
    }
    
    return voice;
  }

  /**
   * Get available voices for the current provider
   */
  getVoices(): string[] {
    const providerConfig = this.getActiveProviderConfig();
    if (!providerConfig) {
      return [];
    }
    
    return providerConfig.voices.filter(
      (voice) => voice && voice.toUpperCase() !== 'ALL'
    );
  }

  /**
   * Split text into chunks for streaming
   */
  splitTextIntoChunks(text: string, chunkSize: number = 4000): TextChunk[] {
    if (!text) {
      throw new Error('Text is required');
    }

    const chunks: TextChunk[] = [];
    let startIndex = 0;
    const textLength = text.length;

    while (startIndex < textLength) {
      let endIndex = Math.min(startIndex + chunkSize, textLength);
      let chunkText = text.slice(startIndex, endIndex);

      // Find natural break point if not at end
      if (endIndex < textLength) {
        let lastSeparatorIndex = -1;
        
        for (const separator of SEPARATORS) {
          const index = chunkText.lastIndexOf(separator);
          if (index !== -1) {
            lastSeparatorIndex = Math.max(lastSeparatorIndex, index);
          }
        }

        if (lastSeparatorIndex !== -1) {
          endIndex = startIndex + lastSeparatorIndex + 1;
          chunkText = text.slice(startIndex, endIndex);
        }
      }

      chunkText = chunkText.trim();
      if (chunkText) {
        chunks.push({
          text: chunkText,
          isFinished: endIndex >= textLength,
        });
      }

      startIndex = endIndex;
      // Skip whitespace
      while (startIndex < textLength && text[startIndex].trim() === '') {
        startIndex++;
      }
    }

    return chunks;
  }

  /**
   * OpenAI provider configuration
   */
  private openAIProvider(config: OpenAIConfig, input: string, voice: string): [string, any, any] {
    const url = config.url || 'https://api.openai.com/v1/audio/speech';

    const data = {
      input,
      model: config.model || 'tts-1',
      voice,
      response_format: 'mp3',
      speed: 1.0,
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };

    return [url, data, headers];
  }

  /**
   * Azure OpenAI provider configuration
   */
  private azureOpenAIProvider(config: AzureOpenAIConfig, input: string, voice: string): [string, any, any] {
    const baseUrl = `https://${config.instanceName}.openai.azure.com`;
    const url = `${baseUrl}/openai/deployments/${config.deploymentName}/audio/speech?api-version=${config.apiVersion}`;

    const data = {
      model: config.model,
      input,
      voice,
    };

    const headers = {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
    };

    return [url, data, headers];
  }

  /**
   * ElevenLabs provider configuration
   */
  private elevenLabsProvider(config: ElevenLabsConfig, input: string, voice: string, stream: boolean = true): [string, any, any] {
    const url = config.url || `https://api.elevenlabs.io/v1/text-to-speech/${voice}${stream ? '/stream' : ''}`;

    const data = {
      model_id: config.model,
      text: input,
      voice_settings: config.voice_settings,
      pronunciation_dictionary_locators: config.pronunciation_dictionary_locators,
    };

    const headers = {
      'Content-Type': 'application/json',
      'xi-api-key': config.apiKey,
      'Accept': 'audio/mpeg',
    };

    return [url, data, headers];
  }

  /**
   * LocalAI provider configuration
   */
  private localAIProvider(config: LocalAIConfig, input: string, voice: string): [string, any, any] {
    if (!config.url) {
      throw new Error('LocalAI requires a URL to be configured');
    }

    const data = {
      input,
      model: voice,
      backend: config.backend,
    };

    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    return [config.url, data, headers];
  }

  /**
   * Make TTS request to provider
   */
  async ttsRequest(options: TTSRequestOptions): Promise<AxiosResponse<Readable>> {
    const { input, voice, stream = true } = options;
    const provider = this.config.provider;
    const providerConfig = this.getActiveProviderConfig();
    
    if (!providerConfig) {
      throw new Error(`No configuration found for provider: ${provider}`);
    }

    const strategy = this.providerStrategies.get(provider);
    if (!strategy) {
      throw new Error(`Invalid provider: ${provider}`);
    }

    const [url, data, headers] = strategy(providerConfig, input, voice, stream);

    // Remove undefined values
    Object.keys(data).forEach(key => {
      if (data[key] === undefined) {
        delete data[key];
      }
    });

    try {
      const response = await axios.post(url, data, {
        headers,
        responseType: stream ? 'stream' : 'arraybuffer',
      });
      
      return response;
    } catch (error: any) {
      console.error(`TTS request failed for provider ${provider}:`, error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Process text to speech with chunking for long texts
   */
  async processTextToSpeech(text: string, voice?: string): Promise<Readable> {
    if (!text) {
      throw new Error('Text is required');
    }

    const selectedVoice = await this.getVoice(voice);

    // For short texts, process directly
    if (text.length < 4096) {
      const response = await this.ttsRequest({
        input: text,
        voice: selectedVoice,
        stream: true,
      });
      return response.data;
    }

    // For long texts, we need to chunk and combine streams
    // This is a simplified version - in production you'd want a more sophisticated stream combiner
    console.warn('Long text chunking not fully implemented in standalone service');
    const response = await this.ttsRequest({
      input: text.substring(0, 4096), // Just take first chunk for now
      voice: selectedVoice,
      stream: true,
    });
    return response.data;
  }

  /**
   * Stream audio for real-time TTS
   * This would integrate with your message queue or real-time system
   */
  async streamAudio(text: string, options: AudioStreamOptions): Promise<Readable> {
    const voice = await this.getVoice(options.voice);
    
    // In the real implementation, this would:
    // 1. Connect to your message queue (Redis, RabbitMQ, etc.)
    // 2. Process text chunks as they arrive
    // 3. Stream audio back in real-time
    
    const response = await this.ttsRequest({
      input: text,
      voice,
      stream: true,
    });
    
    return response.data;
  }
}

// Factory function for creating TTS service
export function createTTSService(config: TTSConfig): TTSService {
  return new TTSService(config);
}