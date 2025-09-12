import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { STTService, STTConfig, STTProvider, TranscriptionResult } from '../services/stt/STTService';
import { Transform, PassThrough } from 'stream';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// STT Service instance
let sttService: STTService;

// Active streaming sessions
const streamingSessions = new Map<string, {
  service: STTService;
  transform: Transform;
  results: TranscriptionResult[];
}>();

// Middleware to ensure STT service is initialized
const ensureSTTService = (req: Request, res: Response, next: NextFunction) => {
  if (!sttService) {
    // Initialize with configuration from environment variables
    const config: STTConfig = {
      provider: (process.env.STT_PROVIDER as STTProvider) || STTProvider.DEEPGRAM,
      apiKey: process.env.STT_API_KEY || process.env.DEEPGRAM_API_KEY || '',
      language: process.env.STT_LANGUAGE || 'en',
      model: process.env.STT_MODEL || 'nova-2',
      enhancedModel: process.env.STT_ENHANCED_MODEL === 'true',
      punctuation: process.env.STT_PUNCTUATION !== 'false',
      interimResults: process.env.STT_INTERIM_RESULTS !== 'false',
      profanityFilter: process.env.STT_PROFANITY_FILTER === 'true',
    };

    try {
      sttService = new STTService(config);
      next();
    } catch (error) {
      res.status(500).json({ error: 'Failed to initialize STT service' });
    }
  } else {
    next();
  }
};

// Apply middleware to all routes
router.use(ensureSTTService);

/**
 * GET /api/stt/providers
 * Get available STT providers
 */
router.get('/providers', (req: Request, res: Response) => {
  res.json({
    providers: Object.values(STTProvider),
    current: process.env.STT_PROVIDER || STTProvider.DEEPGRAM,
  });
});

/**
 * POST /api/stt/transcribe
 * Transcribe an audio file
 */
router.post('/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const result = await sttService.transcribeFile(
      req.file.buffer,
      req.file.mimetype
    );

    res.json(result);
  } catch (error: any) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/stt/stream/start
 * Start a streaming transcription session
 * Returns a session ID
 */
router.post('/stream/start', async (req: Request, res: Response) => {
  try {
    const sessionId = `stt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { sampleRate, channels, encoding } = req.body;

    // Create new STT service instance for this session
    const config: STTConfig = {
      provider: (process.env.STT_PROVIDER as STTProvider) || STTProvider.DEEPGRAM,
      apiKey: process.env.STT_API_KEY || process.env.DEEPGRAM_API_KEY || '',
      language: req.body.language || process.env.STT_LANGUAGE || 'en',
      model: process.env.STT_MODEL || 'nova-2',
      punctuation: true,
      interimResults: true,
    };

    const sessionService = new STTService(config);
    const results: TranscriptionResult[] = [];

    // Set up event handlers
    sessionService.on('transcription', (result) => {
      results.push(result);
      console.log(`[STT Session ${sessionId}] Transcription:`, result.text);
    });

    sessionService.on('error', (error) => {
      console.error(`[STT Session ${sessionId}] Error:`, error);
    });

    sessionService.on('connected', () => {
      console.log(`[STT Session ${sessionId}] Connected to provider`);
    });

    // Start streaming
    const transform = await sessionService.startStreaming({
      sampleRate: sampleRate || 16000,
      channels: channels || 1,
      encoding: encoding || 'pcm',
    });

    // Store session
    streamingSessions.set(sessionId, {
      service: sessionService,
      transform,
      results,
    });

    res.json({
      sessionId,
      status: 'started',
      config: {
        provider: config.provider,
        language: config.language,
        sampleRate: sampleRate || 16000,
        channels: channels || 1,
        encoding: encoding || 'pcm',
      },
    });

  } catch (error: any) {
    console.error('Stream start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/stt/stream/:sessionId/audio
 * Send audio data to a streaming session
 */
router.post('/stream/:sessionId/audio', express.raw({ type: 'audio/*', limit: '10mb' }), (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = streamingSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Write audio data to transform stream
    session.transform.write(req.body);

    res.json({ status: 'received', bytes: req.body.length });

  } catch (error: any) {
    console.error('Stream audio error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stt/stream/:sessionId/results
 * Get transcription results for a session
 */
router.get('/stream/:sessionId/results', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = streamingSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get only new results since last request
    const since = parseInt(req.query.since as string) || 0;
    const newResults = session.results.filter((r, index) => index >= since);

    res.json({
      results: newResults,
      totalCount: session.results.length,
      newCount: newResults.length,
    });

  } catch (error: any) {
    console.error('Get results error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/stt/stream/:sessionId/stop
 * Stop a streaming session
 */
router.post('/stream/:sessionId/stop', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = streamingSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Stop streaming
    session.service.stopStreaming();
    
    // Get final results
    const finalResults = session.results;
    
    // Clean up session
    streamingSessions.delete(sessionId);

    res.json({
      status: 'stopped',
      finalResults,
      totalTranscriptions: finalResults.length,
    });

  } catch (error: any) {
    console.error('Stream stop error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/stt/stream
 * WebSocket-style streaming endpoint (for direct streaming)
 * Expects raw audio stream in request body
 */
router.post('/stream', async (req: Request, res: Response) => {
  try {
    const { language, sampleRate, channels, encoding } = req.query;

    // Create service for this request
    const config: STTConfig = {
      provider: (process.env.STT_PROVIDER as STTProvider) || STTProvider.DEEPGRAM,
      apiKey: process.env.STT_API_KEY || process.env.DEEPGRAM_API_KEY || '',
      language: (language as string) || 'en',
      model: process.env.STT_MODEL || 'nova-2',
      punctuation: true,
      interimResults: true,
    };

    const service = new STTService(config);
    const results: TranscriptionResult[] = [];

    // Set up SSE headers for real-time results
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send results as Server-Sent Events
    service.on('transcription', (result) => {
      results.push(result);
      res.write(`data: ${JSON.stringify(result)}\n\n`);
    });

    service.on('error', (error) => {
      console.error('STT streaming error:', error);
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    });

    service.on('end', () => {
      res.write('event: end\ndata: {"status": "completed"}\n\n');
      res.end();
    });

    // Start streaming
    const transform = await service.startStreaming({
      sampleRate: parseInt(sampleRate as string) || 16000,
      channels: parseInt(channels as string) || 1,
      encoding: (encoding as any) || 'pcm',
    });

    // Pipe request to transform stream
    req.pipe(transform);

    // Handle client disconnect
    req.on('close', () => {
      console.log('Client disconnected from STT stream');
      service.stopStreaming();
    });

  } catch (error: any) {
    console.error('STT stream error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stt/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    provider: process.env.STT_PROVIDER || STTProvider.DEEPGRAM,
    hasApiKey: !!(process.env.STT_API_KEY || process.env.DEEPGRAM_API_KEY),
    activeSessions: streamingSessions.size,
  });
});

export default router;