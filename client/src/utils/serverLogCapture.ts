interface LogEntry {
  type: string;
  timestamp: string;
  message: string;
  args: any[];
}

interface ServerLogCaptureOptions {
  autoStart?: boolean;
  streamLogs?: boolean;
  filters?: string[];
}

class ServerLogCapture {
  private logs: LogEntry[] = [];
  private capturing = false;
  private eventSource: EventSource | null = null;
  private apiBase = '/api/debug';

  constructor(private options: ServerLogCaptureOptions = {}) {
    if (options.autoStart) {
      this.start();
    }
  }

  async start(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBase}/logs/start`, { method: 'POST' });
      const data = await response.json();
      
      if (data.capturing) {
        this.capturing = true;
        console.log('[ServerLogCapture] Started capturing server logs');

        if (this.options.streamLogs) {
          this.startStream();
        }
      }
    } catch (error) {
      console.error('[ServerLogCapture] Failed to start:', error);
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }

      const response = await fetch(`${this.apiBase}/logs/stop`, { method: 'POST' });
      const data = await response.json();
      
      if (!data.capturing) {
        this.capturing = false;
        console.log('[ServerLogCapture] Stopped capturing server logs');
      }
    } catch (error) {
      console.error('[ServerLogCapture] Failed to stop:', error);
    }
  }

  private startStream(): void {
    this.eventSource = new EventSource(`${this.apiBase}/logs/stream`);

    this.eventSource.onmessage = (event) => {
      try {
        const logEntry = JSON.parse(event.data);
        if (logEntry.type !== 'connected') {
          this.logs.push(logEntry);
          console.log(`[ServerLog:${logEntry.type}] ${logEntry.message}`);
        }
      } catch (error) {
        console.error('[ServerLogCapture] Failed to parse log entry:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('[ServerLogCapture] Stream error:', error);
    };
  }

  async getLogs(options: { type?: string | string[]; contains?: string; last?: number } = {}): Promise<LogEntry[]> {
    try {
      const params = new URLSearchParams();
      if (options.type) {
        params.append('type', Array.isArray(options.type) ? options.type.join(',') : options.type);
      }
      if (options.contains) {
        params.append('contains', options.contains);
      }
      if (options.last) {
        params.append('last', options.last.toString());
      }

      const response = await fetch(`${this.apiBase}/logs?${params}`);
      const data = await response.json();
      
      // Update local cache
      this.logs = data.logs || [];
      return this.logs;
    } catch (error) {
      console.error('[ServerLogCapture] Failed to get logs:', error);
      return [];
    }
  }

  async getTTSLogs(): Promise<LogEntry[]> {
    try {
      const response = await fetch(`${this.apiBase}/logs/tts`);
      const data = await response.json();
      return data.logs || [];
    } catch (error) {
      console.error('[ServerLogCapture] Failed to get TTS logs:', error);
      return [];
    }
  }

  async getStreamAudioLogs(): Promise<LogEntry[]> {
    try {
      const response = await fetch(`${this.apiBase}/logs/streamaudio`);
      const data = await response.json();
      return data.logs || [];
    } catch (error) {
      console.error('[ServerLogCapture] Failed to get StreamAudio logs:', error);
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      await fetch(`${this.apiBase}/logs`, { method: 'DELETE' });
      this.logs = [];
      console.log('[ServerLogCapture] Logs cleared');
    } catch (error) {
      console.error('[ServerLogCapture] Failed to clear logs:', error);
    }
  }

  formatLogs(logs: LogEntry[] = this.logs): string {
    return logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      return `[${time}] [${log.type.toUpperCase()}] ${log.message}`;
    }).join('\n');
  }

  // Helper method for TTS debugging
  async startTTSDebugging(): Promise<void> {
    console.log('[ServerLogCapture] Starting TTS debugging...');
    await this.start();
    
    // Auto-refresh TTS logs every 2 seconds
    const intervalId = setInterval(async () => {
      const logs = await this.getTTSLogs();
      if (logs.length > 0) {
        console.log('[ServerLogCapture] Latest TTS logs:', this.formatLogs(logs.slice(-10)));
      }
    }, 2000);

    // Stop after 30 seconds
    setTimeout(() => {
      clearInterval(intervalId);
      this.stop();
    }, 30000);
  }

  // Integration with browser console capture
  async syncWithServerLogs(): Promise<void> {
    const serverLogs = await this.getLogs({ last: 100 });
    const formattedLogs = this.formatLogs(serverLogs);
    
    // If browser console capture exists, add server logs
    if ((window as any).cc) {
      (window as any).cc.capture({
        type: 'info',
        message: `[SERVER LOGS]\n${formattedLogs}`,
        source: 'ServerLogCapture'
      });
    }

    return;
  }
}

// Create global instance
const serverLogCapture = new ServerLogCapture({
  autoStart: process.env.NODE_ENV === 'development',
  streamLogs: false, // Set to true for real-time logs
});

// Expose to window for easy access
if (typeof window !== 'undefined') {
  (window as any).serverLogs = serverLogCapture;
}

export { ServerLogCapture, serverLogCapture };