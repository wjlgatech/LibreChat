import express, { Request, Response, NextFunction } from 'express';
import { TTSService, TTSConfig, TTSProvider } from '../services/tts/TTSService';
import { Readable } from 'stream';

const router = express.Router();

// Initialize TTS Service (configuration would come from environment/config file)
let ttsService: TTSService;

// Middleware to ensure TTS service is initialized
const ensureTTSService = (req: Request, res: Response, next: NextFunction) => {
  if (!ttsService) {
    // Initialize with configuration from environment variables
    const config: TTSConfig = {
      provider: (process.env.TTS_PROVIDER as TTSProvider) || TTSProvider.OPENAI,
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_TTS_MODEL || 'tts-1',
        voices: (process.env.OPENAI_VOICES || 'alloy,echo,fable,onyx,nova,shimmer').split(','),
        defaultVoice: process.env.OPENAI_DEFAULT_VOICE || 'alloy',
      },
      elevenlabs: {
        apiKey: process.env.ELEVENLABS_API_KEY || '',
        model: process.env.ELEVENLABS_MODEL || 'eleven_monolingual_v1',
        voices: (process.env.ELEVENLABS_VOICES || '').split(',').filter(v => v),
        defaultVoice: process.env.ELEVENLABS_DEFAULT_VOICE,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      },
    };

    try {
      ttsService = new TTSService(config);
      next();
    } catch (error) {
      res.status(500).json({ error: 'Failed to initialize TTS service' });
    }
  } else {
    next();
  }
};

// Apply middleware to all routes
router.use(ensureTTSService);

/**
 * GET /api/tts/voices
 * Get available voices for the current provider
 */
router.get('/voices', (req: Request, res: Response) => {
  try {
    const voices = ttsService.getVoices();
    res.json({ 
      provider: process.env.TTS_PROVIDER || TTSProvider.OPENAI,
      voices 
    });
  } catch (error: any) {
    console.error('Error getting voices:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tts/synthesize
 * Synthesize speech from text
 * Body: { text: string, voice?: string }
 */
router.post('/synthesize', async (req: Request, res: Response) => {
  try {
    const { text, voice } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Set response headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Process TTS and stream response
    const audioStream = await ttsService.processTextToSpeech(text, voice);
    
    // Pipe the audio stream to response
    audioStream.pipe(res);

    // Handle stream errors
    audioStream.on('error', (error) => {
      console.error('Audio stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to generate audio' });
      }
    });

  } catch (error: any) {
    console.error('TTS synthesis error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * POST /api/tts/stream
 * Stream TTS for real-time applications
 * Body: { messageId: string, voice?: string }
 */
router.post('/stream', async (req: Request, res: Response) => {
  try {
    const { messageId, text, voice } = req.body;

    if (!messageId && !text) {
      return res.status(400).json({ error: 'Either messageId or text is required' });
    }

    // Set response headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    // For now, we'll use the text directly
    // In production, you'd fetch from message queue/cache
    if (text) {
      const audioStream = await ttsService.streamAudio(text, {
        messageId: messageId || 'direct',
        voice,
      });

      // Stream audio to client
      audioStream.pipe(res);

      // Handle client disconnect
      req.on('close', () => {
        console.log('Client disconnected from TTS stream');
        audioStream.destroy();
      });

      audioStream.on('error', (error) => {
        console.error('Stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream failed' });
        }
      });
    } else {
      // In production, implement message queue integration here
      res.status(501).json({ error: 'Message queue integration not implemented' });
    }

  } catch (error: any) {
    console.error('TTS stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * POST /api/tts/chunk
 * Process a single text chunk (for custom streaming implementations)
 * Body: { text: string, voice?: string, isLast?: boolean }
 */
router.post('/chunk', async (req: Request, res: Response) => {
  try {
    const { text, voice, isLast = false } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const selectedVoice = await ttsService.getVoice(voice);
    const response = await ttsService.ttsRequest({
      input: text,
      voice: selectedVoice,
      stream: true,
    });

    // Set headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-Chunk-Final', isLast.toString());

    // Stream the chunk
    response.data.pipe(res);

  } catch (error: any) {
    console.error('TTS chunk error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tts/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    provider: process.env.TTS_PROVIDER || TTSProvider.OPENAI,
    hasApiKey: !!(process.env.OPENAI_API_KEY || process.env.ELEVENLABS_API_KEY),
  });
});

export default router;