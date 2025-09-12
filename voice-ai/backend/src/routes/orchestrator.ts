import express, { Request, Response } from 'express';
import { 
  OrchestratorService, 
  OrchestratorConfig,
  ConversationTurn 
} from '../services/orchestrator/OrchestratorService';
import { MockOrchestratorService, isMockMode } from '../services/orchestrator/MockOrchestratorService';
import { STTProvider } from '../services/stt/STTService';
import { TTSProvider } from '../services/tts/TTSService';

const router = express.Router();

// Active orchestrator sessions
const sessions = new Map<string, {
  orchestrator: OrchestratorService;
  startTime: number;
  turns: number;
}>();

/**
 * POST /api/orchestrator/session/start
 * Start a new voice AI session
 */
router.post('/session/start', async (req: Request, res: Response) => {
  try {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Build orchestrator configuration
    const config: OrchestratorConfig = {
      stt: {
        provider: (process.env.STT_PROVIDER as STTProvider) || STTProvider.DEEPGRAM,
        apiKey: process.env.STT_API_KEY || process.env.DEEPGRAM_API_KEY || '',
        language: req.body.language || process.env.STT_LANGUAGE || 'en',
        model: process.env.STT_MODEL || 'nova-2',
        punctuation: true,
        interimResults: true,
      },
      tts: {
        provider: (process.env.TTS_PROVIDER as TTSProvider) || TTSProvider.OPENAI,
        openai: {
          apiKey: process.env.OPENAI_API_KEY || '',
          model: process.env.OPENAI_TTS_MODEL || 'tts-1',
          voices: (process.env.OPENAI_VOICES || 'alloy').split(','),
          defaultVoice: req.body.voice || process.env.OPENAI_DEFAULT_VOICE || 'alloy',
        },
      },
      llm: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY || '',
        model: req.body.llmModel || process.env.LLM_MODEL || 'gpt-4',
        systemPrompt: req.body.systemPrompt || process.env.LLM_SYSTEM_PROMPT,
        temperature: req.body.temperature || 0.7,
        maxTokens: req.body.maxTokens || 150,
      },
      streamingMode: req.body.streamingMode !== false,
      bufferThreshold: req.body.bufferThreshold || 50,
    };

    // Create orchestrator (use mock if no API keys)
    const orchestrator = isMockMode() 
      ? new MockOrchestratorService(config)
      : new OrchestratorService(config);
    
    if (isMockMode()) {
      console.log('[Orchestrator] Running in MOCK MODE - no API keys required');
    }
    
    // Set up event handlers for logging
    orchestrator.on('user-speaking', () => {
      console.log(`[Session ${sessionId}] User started speaking`);
    });

    orchestrator.on('user-stopped', () => {
      console.log(`[Session ${sessionId}] User stopped speaking`);
    });

    orchestrator.on('transcription', (text, isFinal) => {
      console.log(`[Session ${sessionId}] Transcription (${isFinal ? 'final' : 'interim'}): ${text}`);
    });

    orchestrator.on('ai-thinking', () => {
      console.log(`[Session ${sessionId}] AI processing...`);
    });

    orchestrator.on('ai-response', (text) => {
      console.log(`[Session ${sessionId}] AI response: ${text}`);
    });

    orchestrator.on('turn-complete', (turn: ConversationTurn) => {
      console.log(`[Session ${sessionId}] Turn complete - Total latency: ${turn.totalLatency}ms`);
    });

    orchestrator.on('error', (error, stage) => {
      console.error(`[Session ${sessionId}] Error in ${stage}:`, error);
    });

    // Store session
    sessions.set(sessionId, {
      orchestrator,
      startTime: Date.now(),
      turns: 0,
    });

    res.json({
      sessionId,
      status: 'created',
      config: {
        sttProvider: config.stt.provider,
        ttsProvider: config.tts.provider,
        llmModel: config.llm.model,
        language: config.stt.language,
        voice: config.tts.openai?.defaultVoice,
        streamingMode: config.streamingMode,
      },
    });

  } catch (error: any) {
    console.error('Session start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/orchestrator/session/:sessionId/audio
 * Stream audio to the orchestrator (for HTTP-based streaming)
 */
router.post('/session/:sessionId/audio', express.raw({ type: 'audio/*', limit: '50mb' }), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // This is a simplified implementation
    // In production, you'd stream this through WebRTC
    res.json({
      status: 'received',
      bytes: req.body.length,
      message: 'Audio processing not fully implemented. Use WebRTC for real-time streaming.',
    });

  } catch (error: any) {
    console.error('Audio processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/orchestrator/session/:sessionId/history
 * Get conversation history for a session
 */
router.get('/session/:sessionId/history', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const history = session.orchestrator.getConversationHistory();
    const latencies = session.orchestrator.getAverageLatencies();

    res.json({
      sessionId,
      turns: history.length,
      history,
      averageLatencies: latencies,
      sessionDuration: Date.now() - session.startTime,
    });

  } catch (error: any) {
    console.error('Get history error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/orchestrator/session/:sessionId/stop
 * Stop a voice AI session
 */
router.post('/session/:sessionId/stop', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Stop orchestrator
    session.orchestrator.stopProcessing();
    
    // Get final stats
    const history = session.orchestrator.getConversationHistory();
    const latencies = session.orchestrator.getAverageLatencies();
    
    // Clean up
    sessions.delete(sessionId);

    res.json({
      status: 'stopped',
      sessionDuration: Date.now() - session.startTime,
      totalTurns: history.length,
      averageLatencies: latencies,
    });

  } catch (error: any) {
    console.error('Session stop error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/orchestrator/sessions
 * List active sessions
 */
router.get('/sessions', (req: Request, res: Response) => {
  const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
    sessionId: id,
    startTime: session.startTime,
    duration: Date.now() - session.startTime,
    turns: session.orchestrator.getConversationHistory().length,
  }));

  res.json({
    activeSessions: sessionList.length,
    sessions: sessionList,
  });
});

/**
 * POST /api/orchestrator/test
 * Test the complete pipeline with a text input
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { text, voice, language, llmModel } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Create a test orchestrator
    const config: OrchestratorConfig = {
      stt: {
        provider: STTProvider.DEEPGRAM,
        apiKey: process.env.DEEPGRAM_API_KEY || '',
        language: language || 'en',
      },
      tts: {
        provider: TTSProvider.OPENAI,
        openai: {
          apiKey: process.env.OPENAI_API_KEY || '',
          model: 'tts-1',
          voices: ['alloy'],
          defaultVoice: voice || 'alloy',
        },
      },
      llm: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY || '',
        model: llmModel || 'gpt-4',
        temperature: 0.7,
        maxTokens: 150,
      },
    };

    const orchestrator = new OrchestratorService(config);
    const startTime = Date.now();

    // Simulate the pipeline
    console.log('[Test] Input:', text);
    
    // Get LLM response (skipping STT for test)
    const llmStart = Date.now();
    // @ts-ignore - accessing private method for testing
    const aiResponse = await orchestrator.getLLMResponse(text);
    const llmLatency = Date.now() - llmStart;
    
    console.log('[Test] AI Response:', aiResponse);
    
    // Generate TTS
    const ttsStart = Date.now();
    const audioStream = await orchestrator['ttsService'].processTextToSpeech(aiResponse);
    const ttsLatency = Date.now() - ttsStart;
    
    const totalLatency = Date.now() - startTime;

    res.json({
      input: text,
      aiResponse,
      latencies: {
        llm: `${llmLatency}ms`,
        tts: `${ttsLatency}ms`,
        total: `${totalLatency}ms`,
      },
      status: 'Test complete',
      note: 'Audio generation successful but not returned in test mode',
    });

  } catch (error: any) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/orchestrator/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  const hasRequiredKeys = !!(
    process.env.OPENAI_API_KEY && 
    (process.env.DEEPGRAM_API_KEY || process.env.ASSEMBLYAI_API_KEY)
  );

  res.json({
    status: hasRequiredKeys ? 'healthy' : 'missing_api_keys',
    activeSessions: sessions.size,
    providers: {
      stt: process.env.STT_PROVIDER || 'deepgram',
      tts: process.env.TTS_PROVIDER || 'openai',
      llm: 'openai',
    },
    hasApiKeys: {
      openai: !!process.env.OPENAI_API_KEY,
      deepgram: !!process.env.DEEPGRAM_API_KEY,
      assemblyai: !!process.env.ASSEMBLYAI_API_KEY,
    },
  });
});

export default router;