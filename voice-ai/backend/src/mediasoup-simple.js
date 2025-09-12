// Simple mediasoup-client wrapper
// This creates a minimal implementation for testing

window.SimplePeerConnection = class {
  constructor(config) {
    this.config = config;
    this.localStream = null;
    this.pc = new RTCPeerConnection(config.iceServers ? { iceServers: config.iceServers } : {});
  }

  async addStream(stream) {
    this.localStream = stream;
    stream.getTracks().forEach(track => {
      this.pc.addTrack(track, stream);
    });
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer() {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(desc) {
    await this.pc.setRemoteDescription(desc);
  }

  close() {
    if (this.pc) {
      this.pc.close();
    }
  }
};

// Mock mediasoup-client for testing
window.mediasoupClient = {
  Device: class Device {
    constructor() {
      this._loaded = false;
      this._capabilities = null;
    }

    async load({ routerRtpCapabilities }) {
      this._capabilities = routerRtpCapabilities;
      this._loaded = true;
      console.log('Mock Device loaded with capabilities:', routerRtpCapabilities);
    }

    get loaded() {
      return this._loaded;
    }

    createSendTransport(options) {
      console.log('Creating mock send transport with options:', options);
      
      return {
        id: options.id,
        closed: false,
        
        on(event, handler) {
          // Store handlers
          this[`_${event}Handler`] = handler;
          
          // Simulate connection after a delay
          if (event === 'connect') {
            setTimeout(() => {
              console.log('Mock transport requesting connection...');
              handler({
                dtlsParameters: {
                  role: 'client',
                  fingerprints: [{
                    algorithm: 'sha-256',
                    value: 'mock-fingerprint'
                  }]
                }
              }, 
              () => console.log('Mock transport connected'),
              (error) => console.error('Mock transport connection error:', error)
              );
            }, 100);
          }
          
          // Simulate produce after connection
          if (event === 'produce') {
            setTimeout(() => {
              console.log('Mock transport requesting produce...');
              handler({
                kind: 'audio',
                rtpParameters: {
                  codecs: [{ mimeType: 'audio/opus', payloadType: 111 }],
                  headerExtensions: [],
                  encodings: [{ ssrc: Math.floor(Math.random() * 1000000) }],
                  rtcp: { cname: 'mock-cname' }
                }
              },
              (result) => {
                console.log('Mock produce callback:', result);
                return result;
              },
              (error) => console.error('Mock produce error:', error)
              );
            }, 200);
          }
        },
        
        async produce({ track, codecOptions, codec, stream, appData }) {
          console.log('Mock producing with track:', track);
          
          // Return a mock producer
          return {
            id: 'mock-producer-' + Math.random().toString(36).substr(2, 9),
            closed: false,
            track,
            kind: track.kind,
            
            close() {
              this.closed = true;
              console.log('Mock producer closed');
            },
            
            on(event, handler) {
              // Store event handlers
              this[`_${event}Handler`] = handler;
            }
          };
        },
        
        close() {
          this.closed = true;
          console.log('Mock transport closed');
        }
      };
    }

    createRecvTransport(options) {
      console.log('Creating mock recv transport');
      return this.createSendTransport(options);
    }
  },

  types: {
    Device: true
  },

  version: '3.7.16-mock'
};

console.log('Simple mediasoup mock loaded. Use window.mediasoupClient');