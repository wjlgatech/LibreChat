# Voice AI Backend Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Keys

Copy the `.env` file and add your API keys:

```bash
# Required API Keys
OPENAI_API_KEY=sk-...  # Get from https://platform.openai.com
DEEPGRAM_API_KEY=...   # Get from https://deepgram.com

# Optional (for alternative providers)
ELEVENLABS_API_KEY=... # Get from https://elevenlabs.io
ASSEMBLYAI_API_KEY=... # Get from https://assemblyai.com
```

### 3. Start the Server
```bash
npm run dev
```

### 4. Test the Services

Open the test clients in your browser:
- TTS Test: http://localhost:3000/test-tts.html
- Complete Pipeline: http://localhost:3000/test-voice-ai.html

## API Key Setup Instructions

### OpenAI API Key (Required)
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Add to `.env`: `OPENAI_API_KEY=sk-...`

### Deepgram API Key (Required for STT)
1. Sign up at https://deepgram.com
2. Go to Console → API Keys
3. Create a new API key
4. Add to `.env`: `DEEPGRAM_API_KEY=...`

## Testing Without API Keys

If you want to test the infrastructure without API keys:

1. **Test MediaSoup WebRTC**: http://localhost:3000/test-client.html
2. **Check Health Endpoints**:
   ```bash
   curl http://localhost:3000/api/tts/health
   curl http://localhost:3000/api/stt/health
   curl http://localhost:3000/api/orchestrator/health
   ```

## Verify Setup

Run this command to check if everything is configured:
```bash
curl http://localhost:3000/api/orchestrator/health
```

Expected response:
```json
{
  "status": "healthy",
  "activeSessions": 0,
  "providers": {
    "stt": "deepgram",
    "tts": "openai",
    "llm": "openai"
  },
  "hasApiKeys": {
    "openai": true,
    "deepgram": true,
    "assemblyai": false
  }
}
```

## Common Issues

### "401 Unauthorized" Error
- You need to add your OpenAI API key to the `.env` file
- Make sure the key starts with `sk-`

### "Cannot POST /api/..." Error  
- The server needs to be restarted after adding routes
- Kill the process: `lsof -ti:3000 | xargs kill -9`
- Start again: `npm run dev`

### High Latency
- Use `tts-1` model instead of `tts-1-hd` (already configured)
- Ensure you're using Deepgram for STT (lowest latency)
- Check your internet connection

## Architecture Overview

```
Voice AI Backend (Port 3000)
├── MediaSoup WebRTC Server
├── TTS Service (Text-to-Speech)
│   └── Providers: OpenAI, ElevenLabs, Azure
├── STT Service (Speech-to-Text)
│   └── Providers: Deepgram, AssemblyAI, OpenAI
└── Orchestrator Service
    └── Pipeline: Audio → STT → LLM → TTS → Audio
```

## Performance Targets

- **Total Latency**: <700ms ✅
- **STT**: ~100-150ms (Deepgram)
- **LLM**: ~200-400ms (GPT-4)
- **TTS**: ~100-150ms (OpenAI)

## Next Steps

Once you have the API keys configured:

1. Test the complete pipeline using the web interface
2. Check the latency metrics
3. Try different voices and languages
4. Monitor the performance dashboard

For production deployment, see the deployment guide in `/voice-ai-docs/`.