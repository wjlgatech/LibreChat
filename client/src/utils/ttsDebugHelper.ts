import { serverLogCapture } from './serverLogCapture';

interface TTSDebugResult {
  browserLogs: any[];
  serverLogs: any[];
  analysis: {
    ttsConditionsMet: boolean;
    activeRunId: string | null;
    messageId: string | null;
    serverErrors: any[];
    apiCalls: any[];
  };
}

class TTSDebugHelper {
  private isDebugging = false;
  private debugStartTime = 0;
  private collectedData: TTSDebugResult = {
    browserLogs: [],
    serverLogs: [],
    analysis: {
      ttsConditionsMet: false,
      activeRunId: null,
      messageId: null,
      serverErrors: [],
      apiCalls: [],
    },
  };

  async startDebugging(): Promise<void> {
    console.log('=== TTS DEBUG HELPER STARTED ===');
    console.log('1. Start continuous voice mode');
    console.log('2. Send a message to trigger AI response');
    console.log('3. Call window.ttsDebug.stopAndAnalyze() when done');
    console.log('================================');

    this.isDebugging = true;
    this.debugStartTime = Date.now();
    this.collectedData = {
      browserLogs: [],
      serverLogs: [],
      analysis: {
        ttsConditionsMet: false,
        activeRunId: null,
        messageId: null,
        serverErrors: [],
        apiCalls: [],
      },
    };

    // Start server log capture
    await serverLogCapture.start();

    // Override console methods to capture browser logs
    this.overrideConsoleMethods();

    // Listen for TTS-specific events
    this.setupEventListeners();
  }

  private overrideConsoleMethods(): void {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args: any[]) => {
      if (this.isDebugging) {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');

        if (message.includes('TTS') || message.includes('StreamAudio') || message.includes('activeRunId')) {
          this.collectedData.browserLogs.push({
            type: 'log',
            timestamp: new Date().toISOString(),
            message,
            args,
          });
        }
      }
      originalLog.apply(console, args);
    };

    console.error = (...args: any[]) => {
      if (this.isDebugging) {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');

        this.collectedData.browserLogs.push({
          type: 'error',
          timestamp: new Date().toISOString(),
          message,
          args,
        });

        if (message.includes('500') || message.includes('TTS')) {
          this.collectedData.analysis.serverErrors.push({
            timestamp: new Date().toISOString(),
            message,
          });
        }
      }
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      if (this.isDebugging) {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');

        if (message.includes('TTS') || message.includes('StreamAudio')) {
          this.collectedData.browserLogs.push({
            type: 'warn',
            timestamp: new Date().toISOString(),
            message,
            args,
          });
        }
      }
      originalWarn.apply(console, args);
    };
  }

  private setupEventListeners(): void {
    // Intercept fetch to capture API calls
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      
      if (this.isDebugging && url.includes('/api/files/speech/tts')) {
        const startTime = Date.now();
        
        try {
          const response = await originalFetch(input, init);
          const duration = Date.now() - startTime;
          
          this.collectedData.analysis.apiCalls.push({
            url,
            method: init?.method || 'GET',
            status: response.status,
            statusText: response.statusText,
            duration,
            timestamp: new Date().toISOString(),
            body: init?.body ? JSON.parse(init.body.toString()) : null,
          });

          return response;
        } catch (error) {
          const duration = Date.now() - startTime;
          
          this.collectedData.analysis.apiCalls.push({
            url,
            method: init?.method || 'GET',
            error: error instanceof Error ? error.message : String(error),
            duration,
            timestamp: new Date().toISOString(),
            body: init?.body ? JSON.parse(init.body.toString()) : null,
          });

          throw error;
        }
      }

      return originalFetch(input, init);
    };
  }

  async stopAndAnalyze(): Promise<TTSDebugResult> {
    if (!this.isDebugging) {
      console.warn('Debugging was not started');
      return this.collectedData;
    }

    console.log('=== STOPPING TTS DEBUG ===');
    this.isDebugging = false;

    // Get server logs
    const serverLogs = await serverLogCapture.getTTSLogs();
    const streamAudioLogs = await serverLogCapture.getStreamAudioLogs();
    
    this.collectedData.serverLogs = [...serverLogs, ...streamAudioLogs];

    // Analyze collected data
    this.analyzeData();

    // Stop server log capture
    await serverLogCapture.stop();

    // Display results
    this.displayResults();

    return this.collectedData;
  }

  private analyzeData(): void {
    // Extract activeRunId from browser logs or API calls
    const runIdLog = this.collectedData.browserLogs.find(log => 
      log.message.includes('activeRunId') || log.message.includes('runId')
    );
    if (runIdLog) {
      // Try multiple patterns
      const patterns = [
        /"activeRunId":\s*"([a-zA-Z0-9-]+)"/,
        /"runId":\s*"([a-zA-Z0-9-]+)"/,
        /activeRunId[:\s]+([a-zA-Z0-9-]+)/,
      ];
      
      for (const pattern of patterns) {
        const match = runIdLog.message.match(pattern);
        if (match) {
          this.collectedData.analysis.activeRunId = match[1];
          break;
        }
      }
    }
    
    // Also check API calls for runId
    const ttsCall = this.collectedData.analysis.apiCalls.find(call => 
      call.url.includes('/api/files/speech/tts')
    );
    if (ttsCall?.body?.runId && !this.collectedData.analysis.activeRunId) {
      this.collectedData.analysis.activeRunId = ttsCall.body.runId;
    }

    // Extract messageId from API calls
    if (ttsCall?.body?.messageId) {
      this.collectedData.analysis.messageId = ttsCall.body.messageId;
    }

    // Check if TTS conditions were met by looking for shouldFetch
    const shouldFetchLog = this.collectedData.browserLogs.find(log => 
      log.message.includes('shouldFetch: true')
    );
    const ttsCheckLog = this.collectedData.browserLogs.find(log => 
      log.message.includes('[StreamAudio] TTS check:')
    );
    
    // If we see a TTS check log with all conditions true, then conditions were met
    if (ttsCheckLog) {
      // Check if the log shows all conditions as true
      const hasAllConditions = ttsCheckLog.message.includes('"token": true') &&
                              ttsCheckLog.message.includes('"automaticPlayback": true') &&
                              ttsCheckLog.message.includes('"latestMessage": true') &&
                              ttsCheckLog.message.includes('"messageIdValid": true');
      this.collectedData.analysis.ttsConditionsMet = hasAllConditions || !!shouldFetchLog;
    }
  }

  private displayResults(): void {
    console.log('=== TTS DEBUG ANALYSIS ===');
    console.log('\n📊 SUMMARY:');
    console.log(`- Debug Duration: ${(Date.now() - this.debugStartTime) / 1000}s`);
    console.log(`- Browser Logs Captured: ${this.collectedData.browserLogs.length}`);
    console.log(`- Server Logs Captured: ${this.collectedData.serverLogs.length}`);
    console.log(`- TTS API Calls: ${this.collectedData.analysis.apiCalls.length}`);
    console.log(`- Server Errors: ${this.collectedData.analysis.serverErrors.length}`);

    console.log('\n🔍 ANALYSIS:');
    console.log(`- TTS Conditions Met: ${this.collectedData.analysis.ttsConditionsMet}`);
    console.log(`- Active Run ID: ${this.collectedData.analysis.activeRunId || 'NOT FOUND'}`);
    console.log(`- Message ID: ${this.collectedData.analysis.messageId || 'NOT FOUND'}`);

    if (this.collectedData.analysis.apiCalls.length > 0) {
      console.log('\n📡 TTS API CALLS:');
      this.collectedData.analysis.apiCalls.forEach((call, index) => {
        console.log(`\n[${index + 1}] ${call.method} ${call.url}`);
        console.log(`  Status: ${call.status || call.error}`);
        console.log(`  Duration: ${call.duration}ms`);
        if (call.body) {
          console.log(`  Body:`, call.body);
        }
      });
    }

    if (this.collectedData.analysis.serverErrors.length > 0) {
      console.log('\n❌ SERVER ERRORS:');
      this.collectedData.analysis.serverErrors.forEach(error => {
        console.log(`- ${error.message}`);
      });
    }

    console.log('\n💡 RECOMMENDATIONS:');
    if (!this.collectedData.analysis.activeRunId) {
      console.log('- activeRunId not found - check SSE message handling');
    }
    if (!this.collectedData.analysis.messageId) {
      console.log('- messageId not found - check message completion handling');
    }
    if (this.collectedData.analysis.serverErrors.some(e => e.message.includes('500'))) {
      console.log('- Server returning 500 errors - check backend logs for details');
    }
    if (!this.collectedData.analysis.ttsConditionsMet) {
      console.log('- TTS conditions not met - check voice mode activation');
    }

    console.log('\n📋 Full debug data available at: window.ttsDebug.getLastDebugData()');
  }

  getLastDebugData(): TTSDebugResult {
    return this.collectedData;
  }

  // Helper to format logs for clipboard
  formatForClipboard(): string {
    const data = this.collectedData;
    let output = '=== TTS DEBUG REPORT ===\n\n';

    output += '## Analysis Summary\n';
    output += `- TTS Conditions Met: ${data.analysis.ttsConditionsMet}\n`;
    output += `- Active Run ID: ${data.analysis.activeRunId || 'NOT FOUND'}\n`;
    output += `- Message ID: ${data.analysis.messageId || 'NOT FOUND'}\n`;
    output += `- API Calls: ${data.analysis.apiCalls.length}\n`;
    output += `- Server Errors: ${data.analysis.serverErrors.length}\n\n`;

    if (data.analysis.apiCalls.length > 0) {
      output += '## TTS API Calls\n';
      data.analysis.apiCalls.forEach((call, i) => {
        output += `${i + 1}. ${call.method} ${call.url}\n`;
        output += `   Status: ${call.status || call.error}\n`;
        output += `   Duration: ${call.duration}ms\n`;
        if (call.body) {
          output += `   Body: ${JSON.stringify(call.body)}\n`;
        }
        output += '\n';
      });
    }

    if (data.browserLogs.length > 0) {
      output += '## Browser Logs (TTS-related)\n';
      data.browserLogs.slice(-20).forEach(log => {
        output += `[${log.type.toUpperCase()}] ${log.message}\n`;
      });
      output += '\n';
    }

    if (data.serverLogs.length > 0) {
      output += '## Server Logs\n';
      data.serverLogs.slice(-20).forEach(log => {
        output += `[${log.type.toUpperCase()}] ${log.message}\n`;
      });
    }

    return output;
  }

  async copyToClipboard(): Promise<void> {
    const text = this.formatForClipboard();
    try {
      await navigator.clipboard.writeText(text);
      console.log('✅ Debug report copied to clipboard');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      console.log('✅ Debug report copied to clipboard (fallback method)');
    }
  }
}

// Create global instance
const ttsDebugHelper = new TTSDebugHelper();

// Auto-start debugging when certain conditions are met
let autoDebugInterval: NodeJS.Timeout | null = null;
let debugSessionActive = false;

function startAutoDebug() {
  if (typeof window === 'undefined' || debugSessionActive) return;
  
  // Check for TTS activation every 500ms
  autoDebugInterval = setInterval(() => {
    // Look for signs that voice mode is active
    const voiceButton = document.querySelector('[data-testid="voice-button"]');
    const isVoiceActive = voiceButton?.getAttribute('aria-pressed') === 'true' || 
                         document.querySelector('.voice-active') !== null ||
                         localStorage.getItem('voiceMode') === 'continuous';
    
    if (isVoiceActive && !debugSessionActive) {
      console.log('[TTS AutoDebug] Voice mode detected - starting automatic debugging');
      debugSessionActive = true;
      ttsDebugHelper.startDebugging();
      
      // Auto-stop after 30 seconds and show results
      setTimeout(async () => {
        if (debugSessionActive) {
          console.log('[TTS AutoDebug] Auto-analyzing after 30 seconds...');
          const results = await ttsDebugHelper.stopAndAnalyze();
          
          // Auto-copy to clipboard
          try {
            await ttsDebugHelper.copyToClipboard();
            console.log('[TTS AutoDebug] Debug report copied to clipboard!');
          } catch (error) {
            console.log('[TTS AutoDebug] Could not auto-copy. Results available at window.ttsDebug.getLastDebugData()');
          }
          
          debugSessionActive = false;
        }
      }, 30000);
    }
  }, 500);
}

// Stop auto-debug
function stopAutoDebug() {
  if (autoDebugInterval) {
    clearInterval(autoDebugInterval);
    autoDebugInterval = null;
  }
  debugSessionActive = false;
}

// Expose to window
if (typeof window !== 'undefined') {
  (window as any).ttsDebug = ttsDebugHelper;
  (window as any).ttsAutoDebug = { start: startAutoDebug, stop: stopAutoDebug };
  
  // Auto-start monitoring in development
  if (process.env.NODE_ENV === 'development') {
    // Wait for page to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startAutoDebug);
    } else {
      startAutoDebug();
    }
    
    console.log('[TTS AutoDebug] Monitoring for voice mode activation...');
  }
}

export { TTSDebugHelper, ttsDebugHelper };