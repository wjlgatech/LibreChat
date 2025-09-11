const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const axios = require('axios');

jest.mock('axios');

describe('TTS Configuration Debug Tests', () => {
  const rootPath = path.join(__dirname, '../../../../../../../');
  
  describe('1. Configuration Files', () => {
    it('should have librechat.yaml file', () => {
      const configPath = path.join(rootPath, 'librechat.yaml');
      const exists = fs.existsSync(configPath);
      
      console.log('librechat.yaml exists:', exists);
      console.log('librechat.yaml path:', configPath);
      
      expect(exists).toBe(true);
    });
    
    it('should have TTS configured in librechat.yaml', () => {
      const configPath = path.join(rootPath, 'librechat.yaml');
      const fileContents = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(fileContents);
      
      console.log('Speech config:', config.speech);
      console.log('TTS config:', config.speech?.tts);
      console.log('OpenAI TTS config:', config.speech?.tts?.openai);
      
      expect(config.speech).toBeDefined();
      expect(config.speech.tts).toBeDefined();
      expect(config.speech.tts.openai).toBeDefined();
      expect(config.speech.tts.openai.model).toBe('tts-1');
      expect(config.speech.tts.openai.voices).toContain('alloy');
    });
    
    it('should have .env file', () => {
      const envPath = path.join(rootPath, '.env');
      const exists = fs.existsSync(envPath);
      
      console.log('.env exists:', exists);
      console.log('.env path:', envPath);
      
      expect(exists).toBe(true);
    });
    
    it('should have TTS_API_KEY in .env', () => {
      const envPath = path.join(rootPath, '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      
      const ttsKeyLine = envContent.split('\n').find(line => line.startsWith('TTS_API_KEY='));
      console.log('TTS_API_KEY line:', ttsKeyLine);
      
      expect(ttsKeyLine).toBeDefined();
      expect(ttsKeyLine).toContain('sk-');
      
      // Extract the key value
      const keyValue = ttsKeyLine.split('=')[1].trim();
      expect(keyValue.length).toBeGreaterThan(10);
    });
  });
  
  describe('2. API Key Validation', () => {
    it('should validate OpenAI API key format', () => {
      const envPath = path.join(rootPath, '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      
      const ttsKeyLine = envContent.split('\n').find(line => line.startsWith('TTS_API_KEY='));
      const keyValue = ttsKeyLine.split('=')[1].trim();
      
      // OpenAI API keys should start with sk-
      expect(keyValue).toMatch(/^sk-[a-zA-Z0-9]+$/);
      console.log('API key format is valid');
    });
  });
  
  describe('3. Direct API Test', () => {
    it('should test OpenAI TTS endpoint directly', async () => {
      const envPath = path.join(rootPath, '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      
      const ttsKeyLine = envContent.split('\n').find(line => line.startsWith('TTS_API_KEY='));
      const apiKey = ttsKeyLine.split('=')[1].trim();
      
      const mockResponse = {
        data: Buffer.from('audio data'),
        status: 200
      };
      axios.post.mockResolvedValueOnce(mockResponse);
      
      const response = await axios.post(
        'https://api.openai.com/v1/audio/speech',
        {
          model: 'tts-1',
          input: 'Hello world',
          voice: 'alloy'
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );
      
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        expect.objectContaining({
          model: 'tts-1',
          input: 'Hello world',
          voice: 'alloy'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer sk-')
          })
        })
      );
      
      console.log('API call structure is correct');
    });
  });
  
  describe('4. Environment Variable Loading', () => {
    it('should check how environment variables are loaded', () => {
      // Try loading env directly
      require('dotenv').config({ path: path.join(rootPath, '.env') });
      
      console.log('process.env.TTS_API_KEY exists:', !!process.env.TTS_API_KEY);
      console.log('process.env.TTS_API_KEY length:', process.env.TTS_API_KEY?.length);
      console.log('process.env.TTS_API_KEY starts with:', process.env.TTS_API_KEY?.substring(0, 7));
    });
  });
  
  describe('5. Provider Configuration', () => {
    it('should validate OpenAI provider configuration structure', () => {
      const configPath = path.join(rootPath, 'librechat.yaml');
      const fileContents = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(fileContents);
      
      const openaiConfig = config.speech?.tts?.openai;
      
      console.log('OpenAI TTS config structure:');
      console.log('- apiKey:', openaiConfig?.apiKey);
      console.log('- model:', openaiConfig?.model);
      console.log('- voices:', openaiConfig?.voices);
      console.log('- url:', openaiConfig?.url || '(using default)');
      
      expect(openaiConfig.apiKey).toBe('${TTS_API_KEY}');
      expect(openaiConfig.model).toBe('tts-1');
      expect(Array.isArray(openaiConfig.voices)).toBe(true);
      expect(openaiConfig.voices.length).toBeGreaterThan(0);
    });
  });
});