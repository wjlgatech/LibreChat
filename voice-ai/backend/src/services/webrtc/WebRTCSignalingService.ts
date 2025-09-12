import { Server as SocketIOServer, Socket } from 'socket.io';
import * as mediasoupTypes from 'mediasoup/node/lib/types';
import { WebRTCAudioBridge } from './WebRTCAudioBridge';
import { OrchestratorService, OrchestratorConfig } from '../orchestrator/OrchestratorService';
import { MockOrchestratorService, isMockMode } from '../orchestrator/MockOrchestratorService';
import { STTProvider } from '../stt/STTService';
import { TTSProvider } from '../tts/TTSService';

interface ClientSession {
  id: string;
  socket: Socket;
  transport?: mediasoupTypes.WebRtcTransport;
  producer?: mediasoupTypes.Producer;
  consumer?: mediasoupTypes.Consumer;
  orchestrator?: OrchestratorService | MockOrchestratorService;
  audioBridge?: WebRTCAudioBridge;
  startTime: number;
}

/**
 * WebRTC Signaling Service
 * Manages WebRTC connections and audio streaming sessions
 */
export class WebRTCSignalingService {
  private io: SocketIOServer;
  private router: mediasoupTypes.Router;
  private sessions = new Map<string, ClientSession>();

  constructor(io: SocketIOServer, router: mediasoupTypes.Router) {
    this.io = io;
    this.router = router;
    this.setupSocketHandlers();
  }

  /**
   * Set up Socket.IO event handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[WebRTCSignaling] Client connected: ${socket.id}`);

      // Create session
      const session: ClientSession = {
        id: socket.id,
        socket,
        startTime: Date.now(),
      };
      this.sessions.set(socket.id, session);

      // Handle events
      socket.on('start-voice-session', async (config) => {
        console.log(`[WebRTCSignaling] Starting voice session for ${socket.id} with config:`, config);
        await this.handleStartVoiceSession(session, config);
      });

      socket.on('connect-transport', async (data) => {
        await this.handleConnectTransport(session, data);
      });

      socket.on('produce', async (data) => {
        await this.handleProduce(session, data);
      });

      socket.on('consume', async (data) => {
        await this.handleConsume(session, data);
      });

      socket.on('resume-consumer', async () => {
        await this.handleResumeConsumer(session);
      });

      socket.on('get-router-rtp-capabilities', async () => {
        console.log(`[WebRTCSignaling] Sending router capabilities to ${socket.id}`);
        socket.emit('router-rtp-capabilities', this.router.rtpCapabilities);
      });

      socket.on('stop-voice-session', () => {
        this.handleStopVoiceSession(session);
      });

      socket.on('ping', () => {
        socket.emit('pong');
      });

      socket.on('disconnect', () => {
        this.handleDisconnect(session);
      });

      socket.on('error', (error) => {
        console.error(`[WebRTCSignaling] Socket error:`, error);
      });
    });
  }

  /**
   * Handle start voice session
   */
  private async handleStartVoiceSession(session: ClientSession, config: any): Promise<void> {
    try {
      console.log(`[WebRTCSignaling] Starting voice session for ${session.id}`);

      // Create orchestrator configuration
      const orchestratorConfig: OrchestratorConfig = {
        stt: {
          provider: config.sttProvider || STTProvider.DEEPGRAM,
          apiKey: process.env.DEEPGRAM_API_KEY || '',
          language: config.language || 'en',
          model: config.sttModel || 'nova-2',
          punctuation: true,
          interimResults: true,
        },
        tts: {
          provider: config.ttsProvider || TTSProvider.OPENAI,
          openai: {
            apiKey: process.env.OPENAI_API_KEY || '',
            model: config.ttsModel || 'tts-1',
            voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
            defaultVoice: config.voice || 'alloy',
          },
        },
        llm: {
          provider: 'openai',
          apiKey: process.env.OPENAI_API_KEY || '',
          model: config.llmModel || 'gpt-4',
          systemPrompt: config.systemPrompt || 'You are a helpful voice assistant. Keep responses concise for voice interaction.',
          temperature: 0.7,
          maxTokens: 150,
        },
        streamingMode: true,
        bufferThreshold: 50,
      };

      // Create orchestrator (use mock if no API keys)
      const orchestrator = isMockMode()
        ? new MockOrchestratorService(orchestratorConfig)
        : new OrchestratorService(orchestratorConfig);

      session.orchestrator = orchestrator;

      // Create WebRTC transport
      const transport = await this.createWebRtcTransport();
      session.transport = transport;

      // Send transport info to client
      session.socket.emit('transport-created', {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });

      // Create audio bridge
      const audioBridge = new WebRTCAudioBridge({
        orchestrator: orchestrator as OrchestratorService,
        router: this.router,
      });

      session.audioBridge = audioBridge;

      // Set up audio bridge event handlers
      audioBridge.on('transcription', (producerId, text, isFinal) => {
        session.socket.emit('transcription', {
          text,
          isFinal,
          timestamp: Date.now(),
        });
      });

      audioBridge.on('ai-response', (producerId, text) => {
        session.socket.emit('ai-response', {
          text,
          timestamp: Date.now(),
        });
      });

      console.log(`[WebRTCSignaling] Voice session started for ${session.id}`);

    } catch (error) {
      console.error(`[WebRTCSignaling] Failed to start voice session:`, error);
      session.socket.emit('error', {
        message: 'Failed to start voice session',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Create WebRTC transport
   */
  private async createWebRtcTransport(): Promise<mediasoupTypes.WebRtcTransport> {
    const transport = await this.router.createWebRtcTransport({
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: '127.0.0.1', // Change for production
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
    });

    return transport;
  }

  /**
   * Handle transport connection
   */
  private async handleConnectTransport(session: ClientSession, data: any): Promise<void> {
    try {
      if (!session.transport) {
        throw new Error('Transport not created');
      }

      await session.transport.connect({
        dtlsParameters: data.dtlsParameters,
      });

      session.socket.emit('transport-connected');
      console.log(`[WebRTCSignaling] Transport connected for ${session.id}`);

    } catch (error) {
      console.error(`[WebRTCSignaling] Transport connection error:`, error);
      session.socket.emit('error', {
        message: 'Failed to connect transport',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle produce (client sending audio)
   */
  private async handleProduce(session: ClientSession, data: any): Promise<void> {
    try {
      if (!session.transport) {
        throw new Error('Transport not connected');
      }

      if (!session.audioBridge) {
        throw new Error('Audio bridge not initialized');
      }

      // Create producer
      const producer = await session.transport.produce({
        kind: 'audio',
        rtpParameters: data.rtpParameters,
      });

      session.producer = producer;

      // Create audio processor
      await session.audioBridge.createAudioProcessor(producer.id, producer);

      session.socket.emit('produced', {
        id: producer.id,
      });

      console.log(`[WebRTCSignaling] Producer created for ${session.id}`);

    } catch (error) {
      console.error(`[WebRTCSignaling] Produce error:`, error);
      session.socket.emit('error', {
        message: 'Failed to create producer',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle consume (client receiving audio)
   */
  private async handleConsume(session: ClientSession, data: any): Promise<void> {
    try {
      if (!session.transport) {
        throw new Error('Transport not connected');
      }

      // For now, we'll create a simple consumer
      // In a real implementation, this would consume from TTS output
      const consumer = await session.transport.consume({
        producerId: data.producerId || 'tts-output',
        rtpCapabilities: data.rtpCapabilities,
        paused: true, // Start paused
      });

      session.consumer = consumer;

      session.socket.emit('consumed', {
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });

      console.log(`[WebRTCSignaling] Consumer created for ${session.id}`);

    } catch (error) {
      console.error(`[WebRTCSignaling] Consume error:`, error);
      session.socket.emit('error', {
        message: 'Failed to create consumer',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle resume consumer
   */
  private async handleResumeConsumer(session: ClientSession): Promise<void> {
    try {
      if (!session.consumer) {
        throw new Error('Consumer not created');
      }

      await session.consumer.resume();
      session.socket.emit('consumer-resumed');

      console.log(`[WebRTCSignaling] Consumer resumed for ${session.id}`);

    } catch (error) {
      console.error(`[WebRTCSignaling] Resume consumer error:`, error);
      session.socket.emit('error', {
        message: 'Failed to resume consumer',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle stop voice session
   */
  private handleStopVoiceSession(session: ClientSession): void {
    try {
      // Stop audio bridge
      if (session.audioBridge) {
        session.audioBridge.stopAll();
      }

      // Stop orchestrator
      if (session.orchestrator) {
        session.orchestrator.stopProcessing();
      }

      // Close producer
      if (session.producer) {
        session.producer.close();
      }

      // Close consumer
      if (session.consumer) {
        session.consumer.close();
      }

      // Close transport
      if (session.transport) {
        session.transport.close();
      }

      session.socket.emit('voice-session-stopped');
      console.log(`[WebRTCSignaling] Voice session stopped for ${session.id}`);

    } catch (error) {
      console.error(`[WebRTCSignaling] Stop session error:`, error);
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(session: ClientSession): void {
    console.log(`[WebRTCSignaling] Client disconnected: ${session.id}`);
    this.handleStopVoiceSession(session);
    this.sessions.delete(session.id);
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      startTime: session.startTime,
      duration: Date.now() - session.startTime,
      hasProducer: !!session.producer,
      hasConsumer: !!session.consumer,
      transportState: session.transport ? 'connected' : 'disconnected',
    };
  }
}

// Factory function
export function createWebRTCSignalingService(
  io: SocketIOServer,
  router: mediasoupTypes.Router
): WebRTCSignalingService {
  return new WebRTCSignalingService(io, router);
}