const EventEmitter = require('events');
const { logger } = require('~/config');

class ServerLogCapture extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxLogs = options.maxLogs || 1000;
    this.logs = [];
    this.capturing = false;
    this.originalMethods = {};
    this.filters = options.filters || [];
  }

  start() {
    if (this.capturing) {
      return;
    }

    this.capturing = true;
    this.logs = [];

    // Store original console methods
    this.originalMethods = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    };

    // Override console methods
    const self = this;
    ['log', 'error', 'warn', 'info', 'debug'].forEach(method => {
      console[method] = function(...args) {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');

        const logEntry = {
          type: method,
          timestamp,
          message,
          args,
        };

        // Add to capture buffer
        self.addLog(logEntry);

        // Emit log event for real-time streaming
        self.emit('log', logEntry);

        // Call original method
        self.originalMethods[method].apply(console, args);
      };
    });

    // Also capture logger output if available
    if (logger) {
      this.captureLogger();
    }

    console.log('[ServerLogCapture] Started capturing server logs');
  }

  captureLogger() {
    // Intercept winston logger transports
    if (logger.transports) {
      logger.transports.forEach(transport => {
        const originalLog = transport.log;
        transport.log = (info, callback) => {
          const logEntry = {
            type: info.level || 'info',
            timestamp: info.timestamp || new Date().toISOString(),
            message: info.message,
            args: [info],
          };

          this.addLog(logEntry);
          this.emit('log', logEntry);

          if (originalLog) {
            originalLog.call(transport, info, callback);
          }
        };
      });
    }
  }

  stop() {
    if (!this.capturing) {
      return;
    }

    // Restore original console methods
    Object.keys(this.originalMethods).forEach(method => {
      console[method] = this.originalMethods[method];
    });

    this.capturing = false;
    console.log('[ServerLogCapture] Stopped capturing server logs');
  }

  addLog(logEntry) {
    // Apply filters
    if (this.filters.length > 0) {
      const shouldCapture = this.filters.some(filter => {
        if (typeof filter === 'string') {
          return logEntry.message.includes(filter);
        }
        if (filter instanceof RegExp) {
          return filter.test(logEntry.message);
        }
        return false;
      });

      if (!shouldCapture) {
        return;
      }
    }

    this.logs.push(logEntry);

    // Maintain max log size
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getLogs(options = {}) {
    let logs = [...this.logs];

    // Filter by type
    if (options.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      logs = logs.filter(log => types.includes(log.type));
    }

    // Filter by content
    if (options.contains) {
      logs = logs.filter(log => log.message.includes(options.contains));
    }

    // Get last N logs
    if (options.last) {
      logs = logs.slice(-options.last);
    }

    return logs;
  }

  getTTSLogs() {
    return this.getLogs({
      contains: 'TTS',
    });
  }

  getStreamAudioLogs() {
    return this.getLogs({
      contains: 'streamAudio',
    });
  }

  clear() {
    this.logs = [];
  }

  toJSON() {
    return {
      logs: this.logs,
      capturing: this.capturing,
      logCount: this.logs.length,
    };
  }
}

// Create singleton instance
const serverLogCapture = new ServerLogCapture({
  filters: [
    'TTS',
    'streamAudio',
    'speech',
    'audio',
    /\[TTS.*\]/,
    /\[streamAudio\]/,
    'TTSService',
    'getVoice',
    'ttsRequest',
    'openAIProvider',
  ],
});

module.exports = { 
  serverLogCapture,
  ServerLogCapture,
};