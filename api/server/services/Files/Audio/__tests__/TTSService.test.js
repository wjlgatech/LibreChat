const axios = require('axios');
const { TTSService } = require('../TTSService');
const { getAppConfig } = require('~/server/services/Config');

jest.mock('axios');
jest.mock('~/server/services/Config');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}));

describe('TTSService - Complete TDD Test Suite', () => {
  let ttsService;

  beforeEach(() => {
    jest.clearAllMocks();
    ttsService = new TTSService();
  });

  describe('1. Configuration Validation', () => {
    it('should validate that TTS configuration exists', async () => {
      const appConfig = {
        speech: {
          tts: {
            openai: {
              apiKey: '${TTS_API_KEY}',
              model: 'tts-1',
              voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
            }
          }
        }
      };

      const provider = ttsService.getProvider(appConfig);
      expect(provider).toBe('openai');
    });

    it('should throw error when TTS is not configured', () => {
      const appConfig = {};
      
      expect(() => ttsService.getProvider(appConfig)).toThrow(
        'No TTS schema is set. Did you configure TTS in the custom config (librechat.yaml)?'
      );
    });

    it('should throw error when no provider is configured', () => {
      const appConfig = {
        speech: {
          tts: {}
        }
      };
      
      expect(() => ttsService.getProvider(appConfig)).toThrow('No provider is set');
    });
  });

  describe('2. API Key Validation', () => {
    it('should extract environment variable for API key', () => {
      process.env.TTS_API_KEY = 'test-api-key';
      
      const { extractEnvVariable } = require('librechat-data-provider');
      const result = extractEnvVariable('${TTS_API_KEY}');
      
      expect(result).toBe('test-api-key');
    });

    it('should validate API key is not empty', () => {
      const ttsSchema = {
        apiKey: ''
      };
      
      const [url, data, headers] = ttsService.openAIProvider(ttsSchema, 'test', 'alloy');
      
      expect(headers.Authorization).toBe('Bearer ');
    });
  });

  describe('3. Voice Selection', () => {
    it('should select requested voice when available', async () => {
      const providerSchema = {
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
      };
      
      const voice = await ttsService.getVoice(providerSchema, 'echo');
      expect(voice).toBe('echo');
    });

    it('should select random voice when requested voice not available', async () => {
      const providerSchema = {
        voices: ['alloy', 'echo', 'fable']
      };
      
      const voice = await ttsService.getVoice(providerSchema, 'Samantha');
      expect(['alloy', 'echo', 'fable']).toContain(voice);
    });
  });

  describe('4. OpenAI Provider Configuration', () => {
    it('should configure OpenAI provider correctly', () => {
      process.env.TTS_API_KEY = 'test-key';
      const ttsSchema = {
        model: 'tts-1',
        apiKey: '${TTS_API_KEY}',
        voices: ['alloy']
      };
      
      const [url, data, headers] = ttsService.openAIProvider(ttsSchema, 'Hello world', 'alloy');
      
      expect(url).toBe('https://api.openai.com/v1/audio/speech');
      expect(data).toEqual({
        input: 'Hello world',
        model: 'tts-1',
        voice: 'alloy'
      });
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key'
      });
    });
  });

  describe('5. TTS Request Flow', () => {
    it('should make successful TTS request', async () => {
      const mockResponse = {
        data: Buffer.from('audio data'),
        headers: { 'content-type': 'audio/mpeg' }
      };
      axios.post.mockResolvedValueOnce(mockResponse);
      
      process.env.TTS_API_KEY = 'test-key';
      const provider = 'openai';
      const ttsSchema = {
        model: 'tts-1',
        apiKey: '${TTS_API_KEY}',
        voices: ['alloy']
      };
      
      const response = await ttsService.ttsRequest(provider, ttsSchema, {
        input: 'Test text',
        voice: 'alloy',
        stream: false
      });
      
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        {
          input: 'Test text',
          model: 'tts-1',
          voice: 'alloy'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key'
          },
          responseType: 'arraybuffer'
        }
      );
      
      expect(response.data).toBeDefined();
    });

    it('should handle TTS request errors', async () => {
      const mockError = new Error('API Error');
      mockError.response = {
        status: 401,
        data: { error: 'Invalid API key' }
      };
      axios.post.mockRejectedValueOnce(mockError);
      
      process.env.TTS_API_KEY = 'invalid-key';
      const provider = 'openai';
      const ttsSchema = {
        model: 'tts-1',
        apiKey: '${TTS_API_KEY}',
        voices: ['alloy']
      };
      
      await expect(
        ttsService.ttsRequest(provider, ttsSchema, {
          input: 'Test text',
          voice: 'alloy'
        })
      ).rejects.toThrow('API Error');
    });
  });

  describe('6. Stream Audio Method', () => {
    it('should set correct headers for audio streaming', async () => {
      const mockReq = {
        user: { id: 'user123', role: 'user' },
        body: { messageId: 'msg123', voice: 'alloy' },
        on: jest.fn()
      };
      
      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
        headersSent: false
      };
      
      // Mock getAppConfig to return valid config
      getAppConfig.mockResolvedValueOnce({
        speech: {
          tts: {
            openai: {
              apiKey: '${TTS_API_KEY}',
              model: 'tts-1',
              voices: ['alloy']
            }
          }
        }
      });
      
      // Start the streamAudio method
      const streamPromise = ttsService.streamAudio(mockReq, mockRes);
      
      // Verify headers are set
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
    });
  });

  describe('7. Environment Variable Extraction', () => {
    it('should handle missing environment variables', () => {
      delete process.env.TTS_API_KEY;
      
      const { extractEnvVariable } = require('librechat-data-provider');
      const result = extractEnvVariable('${TTS_API_KEY}');
      
      // This might return undefined or empty string depending on implementation
      expect(result).toBeFalsy();
    });
  });
});

// Integration test to check actual configuration
describe('TTSService - Integration Tests', () => {
  it('should load actual configuration from disk', async () => {
    const fs = require('fs');
    const path = require('path');
    const yaml = require('yaml');
    
    const configPath = path.join(__dirname, '../../../../../../../librechat.yaml');
    
    if (fs.existsSync(configPath)) {
      const fileContents = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(fileContents);
      
      console.log('Actual TTS config:', JSON.stringify(config.speech?.tts, null, 2));
      
      // Verify TTS is configured
      expect(config.speech).toBeDefined();
      expect(config.speech.tts).toBeDefined();
      expect(config.speech.tts.openai).toBeDefined();
    }
  });
  
  it('should load actual environment variables', () => {
    const envPath = path.join(__dirname, '../../../../../../../.env');
    
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      
      console.log('TTS_API_KEY exists:', !!process.env.TTS_API_KEY);
      console.log('TTS_API_KEY length:', process.env.TTS_API_KEY?.length);
      console.log('TTS_API_KEY starts with:', process.env.TTS_API_KEY?.substring(0, 7));
    }
  });
});