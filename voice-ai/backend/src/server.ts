import express from 'express';
import { Server } from 'socket.io';
import * as mediasoup from 'mediasoup';
import { types as mediasoupTypes } from 'mediasoup';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import ttsRouter from './routes/tts';
import sttRouter from './routes/stt';
import orchestratorRouter from './routes/orchestrator';
import { createWebRTCSignalingService } from './services/webrtc/WebRTCSignalingService';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('src')); // Serve static files from src directory

// Serve mediasoup-client library
app.get('/mediasoup-client.js', (req, res) => {
  res.redirect('https://unpkg.com/mediasoup-client@3.7.16/lib/mediasoup-client.min.js');
});

// API Routes
app.use('/api/tts', ttsRouter);
app.use('/api/stt', sttRouter);
app.use('/api/orchestrator', orchestratorRouter);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

// MediaSoup globals
let worker: mediasoupTypes.Worker;
let router: mediasoupTypes.Router;
let signalingService: ReturnType<typeof createWebRTCSignalingService>;

// MediaSoup configuration
const mediaCodecs: mediasoupTypes.RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 101,
    parameters: {
      'minptime': 10,
      'useinbandfec': 1
    }
  }
];

// Create MediaSoup worker
async function createWorker(): Promise<mediasoupTypes.Worker> {
  const worker = await mediasoup.createWorker({
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: 'warn',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
    ],
  });

  console.log(`Worker created, pid ${worker.pid}`);

  worker.on('died', () => {
    console.error('MediaSoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
}

// Create router
async function createRouter(worker: mediasoupTypes.Worker): Promise<mediasoupTypes.Router> {
  const router = await worker.createRouter({
    mediaCodecs
  });

  return router;
}

// Initialize MediaSoup
async function initializeMediaSoup() {
  worker = await createWorker();
  router = await createRouter(worker);
  
  // Initialize WebRTC signaling service
  signalingService = createWebRTCSignalingService(io, router);
  
  console.log('MediaSoup initialized successfully');
  console.log('WebRTC signaling service ready');
}

// Socket.IO connection handling is now managed by WebRTCSignalingService
// The old handlers are kept here for reference but commented out
/*
io.on('connection', (socket) => {
  // Handled by WebRTCSignalingService
});
*/

// Transport management
const transports = new Map<string, mediasoupTypes.WebRtcTransport>();
const producers = new Map<string, mediasoupTypes.Producer>();
const consumers = new Map<string, mediasoupTypes.Consumer>();

// Create WebRTC transport
async function createWebRtcTransport(direction: 'send' | 'recv'): Promise<mediasoupTypes.WebRtcTransport> {
  const transport = await router.createWebRtcTransport({
    listenIps: [
      { ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1' }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
  });

  transports.set(transport.id, transport);

  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed') {
      transport.close();
      transports.delete(transport.id);
    }
  });

  transport.on('@close', () => {
    transports.delete(transport.id);
  });

  return transport;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    worker: worker ? 'active' : 'inactive',
    router: router ? 'active' : 'inactive',
    transports: transports.size,
    producers: producers.size,
    consumers: consumers.size,
  });
});

// Get server stats
app.get('/stats', async (req, res) => {
  try {
    const workerResourceUsage = await worker.getResourceUsage();
    const routerDump = await router.dump();
    
    res.json({
      worker: {
        pid: worker.pid,
        resourceUsage: workerResourceUsage,
      },
      router: {
        id: router.id,
        transportCount: transports.size,
        producerCount: producers.size,
        consumerCount: consumers.size,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await initializeMediaSoup();
    
    server.listen(PORT, () => {
      console.log(`Voice AI server running on port ${PORT}`);
      console.log('MediaSoup ready for WebRTC connections');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  
  // Close all transports
  for (const [id, transport] of transports) {
    transport.close();
  }
  
  // Close worker
  if (worker) {
    await worker.close();
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
startServer();