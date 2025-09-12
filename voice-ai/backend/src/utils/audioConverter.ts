import { Transform } from 'stream';

/**
 * Audio format conversion utilities for WebRTC
 */

export interface AudioFormat {
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

export interface RtpHeader {
  version: number;
  padding: boolean;
  extension: boolean;
  csrcCount: number;
  marker: boolean;
  payloadType: number;
  sequenceNumber: number;
  timestamp: number;
  ssrc: number;
}

/**
 * Parse RTP header from buffer
 */
export function parseRtpHeader(buffer: Buffer): RtpHeader | null {
  if (buffer.length < 12) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  return {
    version: (firstByte >> 6) & 0x03,
    padding: !!(firstByte & 0x20),
    extension: !!(firstByte & 0x10),
    csrcCount: firstByte & 0x0f,
    marker: !!(secondByte & 0x80),
    payloadType: secondByte & 0x7f,
    sequenceNumber: buffer.readUInt16BE(2),
    timestamp: buffer.readUInt32BE(4),
    ssrc: buffer.readUInt32BE(8),
  };
}

/**
 * Create RTP header buffer
 */
export function createRtpHeader(
  payloadType: number,
  sequenceNumber: number,
  timestamp: number,
  ssrc: number,
  marker: boolean = false
): Buffer {
  const header = Buffer.alloc(12);
  
  // V=2, P=0, X=0, CC=0
  header[0] = 0x80;
  
  // M=marker, PT=payloadType
  header[1] = (marker ? 0x80 : 0x00) | (payloadType & 0x7f);
  
  // Sequence number
  header.writeUInt16BE(sequenceNumber & 0xffff, 2);
  
  // Timestamp
  header.writeUInt32BE(timestamp, 4);
  
  // SSRC
  header.writeUInt32BE(ssrc, 8);
  
  return header;
}

/**
 * Convert Opus RTP packets to raw PCM audio
 */
export class OpusRtpToPcmConverter extends Transform {
  private sequenceNumber = 0;
  private timestamp = 0;
  private ssrc = Math.floor(Math.random() * 0xffffffff);

  constructor(private format: AudioFormat) {
    super();
  }

  _transform(chunk: Buffer, encoding: string, callback: Function): void {
    try {
      const header = parseRtpHeader(chunk);
      if (!header) {
        callback(new Error('Invalid RTP packet'));
        return;
      }

      // Extract Opus payload (skip RTP header)
      const headerSize = 12 + (header.csrcCount * 4);
      const payload = chunk.slice(headerSize);

      // For now, we pass through the Opus payload
      // In a real implementation, you would decode Opus to PCM here
      // using a library like node-opus or @discordjs/opus
      
      this.push(payload);
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

/**
 * Convert raw PCM audio to Opus RTP packets
 */
export class PcmToOpusRtpConverter extends Transform {
  private sequenceNumber = 0;
  private timestamp = 0;
  private ssrc = Math.floor(Math.random() * 0xffffffff);
  private readonly payloadType = 111; // Opus
  private readonly frameDuration = 20; // ms
  private readonly frameSize: number;

  constructor(private format: AudioFormat) {
    super();
    // Calculate frame size in samples
    this.frameSize = (this.format.sampleRate * this.frameDuration) / 1000;
  }

  _transform(chunk: Buffer, encoding: string, callback: Function): void {
    try {
      // For now, we create RTP packets with raw audio
      // In a real implementation, you would encode PCM to Opus here
      
      const header = createRtpHeader(
        this.payloadType,
        this.sequenceNumber++,
        this.timestamp,
        this.ssrc
      );

      // Increment timestamp by frame size
      this.timestamp += this.frameSize;

      // Combine header and payload
      const rtpPacket = Buffer.concat([header, chunk]);
      
      this.push(rtpPacket);
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

/**
 * Simple audio resampler
 */
export class AudioResampler extends Transform {
  constructor(
    private inputFormat: AudioFormat,
    private outputFormat: AudioFormat
  ) {
    super();
  }

  _transform(chunk: Buffer, encoding: string, callback: Function): void {
    // Simple pass-through for now
    // In a real implementation, you would use a resampling library
    // like node-libsamplerate or speex-resampler
    this.push(chunk);
    callback();
  }
}

/**
 * Audio level monitor
 */
export class AudioLevelMonitor extends Transform {
  private sampleCount = 0;
  private sumSquares = 0;
  private readonly reportInterval: number;
  
  constructor(
    private format: AudioFormat,
    private onLevel: (level: number) => void,
    reportIntervalMs: number = 100
  ) {
    super();
    this.reportInterval = (format.sampleRate * reportIntervalMs) / 1000;
  }

  _transform(chunk: Buffer, encoding: string, callback: Function): void {
    // Calculate RMS level
    const samples = chunk.length / (this.format.bitDepth / 8);
    
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = chunk.readInt16LE(i) / 32768.0;
      this.sumSquares += sample * sample;
      this.sampleCount++;
      
      if (this.sampleCount >= this.reportInterval) {
        const rms = Math.sqrt(this.sumSquares / this.sampleCount);
        const db = 20 * Math.log10(rms);
        this.onLevel(Math.max(-60, db)); // Clamp to -60dB minimum
        
        this.sampleCount = 0;
        this.sumSquares = 0;
      }
    }
    
    this.push(chunk);
    callback();
  }
}

/**
 * Silence detector
 */
export class SilenceDetector extends Transform {
  private silenceSamples = 0;
  private readonly silenceThreshold: number;
  private readonly silenceDuration: number;
  private isSilent = false;
  
  constructor(
    private format: AudioFormat,
    private onSilenceChange: (isSilent: boolean) => void,
    silenceThresholdDb: number = -40,
    silenceDurationMs: number = 300
  ) {
    super();
    this.silenceThreshold = Math.pow(10, silenceThresholdDb / 20);
    this.silenceDuration = (format.sampleRate * silenceDurationMs) / 1000;
  }

  _transform(chunk: Buffer, encoding: string, callback: Function): void {
    const samples = chunk.length / (this.format.bitDepth / 8);
    let maxAmplitude = 0;
    
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = Math.abs(chunk.readInt16LE(i) / 32768.0);
      maxAmplitude = Math.max(maxAmplitude, sample);
    }
    
    if (maxAmplitude < this.silenceThreshold) {
      this.silenceSamples += samples;
      
      if (this.silenceSamples >= this.silenceDuration && !this.isSilent) {
        this.isSilent = true;
        this.onSilenceChange(true);
      }
    } else {
      if (this.isSilent) {
        this.isSilent = false;
        this.onSilenceChange(false);
      }
      this.silenceSamples = 0;
    }
    
    this.push(chunk);
    callback();
  }
}

/**
 * Audio chunker - splits audio into fixed-size chunks
 */
export class AudioChunker extends Transform {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly chunkSize: number;
  
  constructor(
    private format: AudioFormat,
    chunkDurationMs: number = 20
  ) {
    super();
    const bytesPerSample = format.bitDepth / 8;
    const samplesPerChunk = (format.sampleRate * chunkDurationMs) / 1000;
    this.chunkSize = samplesPerChunk * bytesPerSample * format.channels;
  }

  _transform(chunk: Buffer, encoding: string, callback: Function): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    
    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.slice(0, this.chunkSize);
      this.buffer = this.buffer.slice(this.chunkSize);
      this.push(chunk);
    }
    
    callback();
  }

  _flush(callback: Function): void {
    if (this.buffer.length > 0) {
      // Pad with silence if needed
      const padding = Buffer.alloc(this.chunkSize - this.buffer.length);
      const finalChunk = Buffer.concat([this.buffer, padding]);
      this.push(finalChunk);
    }
    callback();
  }
}