import { EventEmitter } from 'events';
import { Transform, PassThrough, Readable } from 'stream';
import { types as mediasoupTypes } from 'mediasoup';
import { OpusRtpToPcmConverter, AudioLevelMonitor, SilenceDetector } from '../../utils/audioConverter';

interface WebRTCAudioBridgeConfig {
  orchestrator: any; // OrchestratorService instance
  router: mediasoupTypes.Router;
  audioFormat?: {
    sampleRate: number;
    channels: number;
    bitDepth: number;
  };
}

interface AudioProcessor {
  inputStream: Transform;
  outputStream: PassThrough;
  isActive: boolean;
  plainTransport?: mediasoupTypes.PlainTransport;
  plainConsumer?: mediasoupTypes.Consumer;
}

/**
 * Bridge between MediaSoup WebRTC and STT/TTS services
 * Handles audio format conversion and duplex streaming
 */
export class WebRTCAudioBridge extends EventEmitter {
  private config: Required<WebRTCAudioBridgeConfig>;
  private audioProcessors = new Map<string, AudioProcessor>();
  private router: mediasoupTypes.Router;
  private sequenceNumber = 0;
  private timestamp = 0;

  constructor(config: WebRTCAudioBridgeConfig) {
    super();
    this.config = {
      audioFormat: {
        sampleRate: 48000,
        channels: 2,
        bitDepth: 16,
        ...config.audioFormat,
      },
      ...config,
    };
    this.router = config.router;
  }

  /**
   * Create audio processor for a WebRTC producer
   * Uses PlainTransport to get raw RTP packets from MediaSoup
   */
  async createAudioProcessor(
    producerId: string,
    producer: mediasoupTypes.Producer
  ): Promise<AudioProcessor> {
    console.log(`[WebRTCAudioBridge] Creating audio processor for producer ${producerId}`);

    try {
      // Create a PlainTransport to receive RTP from the producer
      const plainTransport = await this.router.createPlainTransport({
        listenIp: { ip: '127.0.0.1', announcedIp: undefined },
        rtcpMux: false,
        comedia: true, // Server will auto-detect client's IP/port
      });

      // Get the local RTP port
      const rtpPort = plainTransport.tuple.localPort;
      console.log(`[WebRTCAudioBridge] PlainTransport listening on RTP port ${rtpPort}`);

      // Create a consumer for the producer on the plain transport
      const plainConsumer = await plainTransport.consume({
        producerId: producer.id,
        rtpCapabilities: this.router.rtpCapabilities,
        paused: false,
      });

      console.log(`[WebRTCAudioBridge] Created plain consumer ${plainConsumer.id}`);

      // Create audio processing pipeline
      const audioFormat = this.config.audioFormat;
      const rtpToAudioConverter = new OpusRtpToPcmConverter(audioFormat);
      const audioLevelMonitor = new AudioLevelMonitor(
        audioFormat,
        (level: number) => {
          this.emit('audio-level', producerId, level);
        }
      );
      const silenceDetector = new SilenceDetector(
        audioFormat,
        (isSilent: boolean) => {
          if (isSilent) {
            console.log('[WebRTCAudioBridge] Silence detected');
            this.emit('silence-start', producerId);
          } else {
            console.log('[WebRTCAudioBridge] Speech detected');
            this.emit('silence-end', producerId);
          }
        },
        -40, // silence threshold in dB
        500  // silence duration in ms
      );
      const outputStream = new PassThrough();

      // Set up the audio processing pipeline
      rtpToAudioConverter
        .pipe(audioLevelMonitor)
        .pipe(silenceDetector);

      const processor: AudioProcessor = {
        inputStream: rtpToAudioConverter,
        outputStream,
        isActive: true,
        plainTransport,
        plainConsumer,
      };

      // Store processor
      this.audioProcessors.set(producerId, processor);

      // Connect to orchestrator for STT processing
      try {
        await this.connectToOrchestrator(producerId, silenceDetector, outputStream);
      } catch (orchError) {
        console.error(`[WebRTCAudioBridge] Failed to connect to orchestrator:`, orchError);
        // Continue anyway - WebRTC connection should still work
      }

      // Now we need to pipe RTP data from MediaSoup to our converter
      // This would typically be done by configuring MediaSoup to send RTP to our plain transport
      // For now, we'll set up the connection info
      console.log(`[WebRTCAudioBridge] Audio processor ready for producer ${producerId}`);
      console.log(`[WebRTCAudioBridge] RTP should be sent to 127.0.0.1:${rtpPort}`);

      return processor;

    } catch (error) {
      console.error(`[WebRTCAudioBridge] Failed to create audio processor:`, error);
      throw error;
    }
  }

  /**
   * Connect audio stream to orchestrator
   */
  private async connectToOrchestrator(
    producerId: string,
    inputStream: Transform,
    outputStream: PassThrough
  ): Promise<void> {
    try {
      // Set up event handlers for orchestrator events
      this.config.orchestrator.on('transcription', (data: any) => {
        console.log(`[WebRTCAudioBridge] Transcription: ${data.text}`);
        this.emit('transcription', producerId, data.text, data.isFinal);
      });

      this.config.orchestrator.on('ai-response', (data: any) => {
        console.log(`[WebRTCAudioBridge] AI Response: ${data.text}`);
        this.emit('ai-response', producerId, data.text);
      });

      this.config.orchestrator.on('tts-audio', (audioChunk: Buffer) => {
        // Convert TTS audio to RTP and send through output stream
        const rtpPackets = this.convertRawToRtp(audioChunk);
        for (const packet of rtpPackets) {
          outputStream.write(packet);
        }
        this.emit('tts-audio', producerId, audioChunk);
      });

      // Create duplex stream for orchestrator
      const duplexStream = await this.config.orchestrator.createDuplexStream();
      
      // Pipe audio through orchestrator
      inputStream.pipe(duplexStream).pipe(outputStream);

      console.log(`[WebRTCAudioBridge] Connected producer ${producerId} to orchestrator`);

    } catch (error) {
      console.error(`[WebRTCAudioBridge] Orchestrator connection error:`, error);
      // Don't throw here, just log the error and continue
      // This allows the WebRTC connection to stay alive even if orchestrator fails
    }
  }

  /**
   * Convert raw audio to RTP packets
   */
  private convertRawToRtp(rawAudio: Buffer): Buffer[] {
    const packets: Buffer[] = [];
    const MAX_PAYLOAD_SIZE = 1400; // MTU safe size
    
    // Split audio into chunks if needed
    let offset = 0;
    while (offset < rawAudio.length) {
      const payloadSize = Math.min(MAX_PAYLOAD_SIZE, rawAudio.length - offset);
      const payload = rawAudio.slice(offset, offset + payloadSize);
      
      // Create RTP header (simplified)
      const header = Buffer.alloc(12);
      header[0] = 0x80; // Version 2, no padding, no extension, no CSRC
      header[1] = 111;  // Payload type for Opus
      header.writeUInt16BE(this.sequenceNumber++, 2); // Sequence number
      header.writeUInt32BE(this.timestamp, 4); // Timestamp
      header.writeUInt32BE(0x12345678, 8); // SSRC
      
      // Combine header and payload
      const rtpPacket = Buffer.concat([header, payload]);
      packets.push(rtpPacket);
      
      offset += payloadSize;
      this.timestamp += 960; // 20ms of audio at 48kHz
    }
    
    return packets;
  }

  /**
   * Stop audio processor
   */
  async stopAudioProcessor(producerId: string): Promise<void> {
    const processor = this.audioProcessors.get(producerId);
    if (processor) {
      processor.isActive = false;
      
      // Close MediaSoup resources
      if (processor.plainConsumer) {
        processor.plainConsumer.close();
      }
      if (processor.plainTransport) {
        processor.plainTransport.close();
      }
      
      // Close streams
      processor.inputStream.destroy();
      processor.outputStream.destroy();
      
      this.audioProcessors.delete(producerId);
      console.log(`[WebRTCAudioBridge] Stopped audio processor for ${producerId}`);
    }
  }

  /**
   * Get active audio processors
   */
  getActiveProcessors(): string[] {
    return Array.from(this.audioProcessors.keys());
  }

  /**
   * Stop all audio processors
   */
  async stopAll(): Promise<void> {
    const processorIds = this.getActiveProcessors();
    for (const id of processorIds) {
      await this.stopAudioProcessor(id);
    }
    console.log('[WebRTCAudioBridge] Stopped all audio processors');
  }
}