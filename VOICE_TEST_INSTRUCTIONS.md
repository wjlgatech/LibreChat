# Voice Response Testing Instructions

## Setup
1. The frontend is running at http://localhost:3091/
2. The backend should be running at http://localhost:3080/

## Test Steps

### Test 1: Single Voice Mode
1. Open http://localhost:3091/ in Chrome or a Chromium-based browser
2. Start a new conversation
3. Click the sound wave icon once (single click)
4. Speak a question like "What is the capital of France?"
5. Wait for the AI to respond
6. **Expected**: You should hear the AI response spoken out loud

### Test 2: Continuous Voice Mode  
1. Double-click the sound wave icon
2. You should see a toast notification about continuous mode
3. Speak a question and pause for 1.5 seconds
4. **Expected**: 
   - Your speech is transcribed and sent automatically
   - AI responds with text
   - AI response is spoken out loud
   - After speech ends, the system resumes listening (green dot pulsing)

### Test 3: Debug Output
1. Open browser DevTools Console (F12)
2. Filter by "[VoiceUnified]" to see all voice-related logs
3. Look for these key messages:
   - "TTS Settings - textToSpeech: true" 
   - "Speaking AI response for message: ..."
   - "Speaking: [AI response text]..."

### Common Issues
1. If no voice response:
   - Check if textToSpeech is enabled in Settings > Speech
   - Check browser console for errors
   - Make sure browser has TTS voices available

2. If voice cuts off in continuous mode:
   - This might happen if recognition restarts too quickly
   - Check console for "Speech ended" and "Resuming listening" logs

3. Browser compatibility:
   - Works best in Chrome/Edge/Brave
   - Firefox may have limited voice options
   - Safari requires permissions for speech recognition

### Quick Browser TTS Test
Run this in the browser console to test if TTS works:
```javascript
// Test if browser supports TTS
if (window.speechSynthesis) {
  const utterance = new SpeechSynthesisUtterance("Hello, this is a test of text to speech");
  window.speechSynthesis.speak(utterance);
  console.log("TTS test started - you should hear speech");
} else {
  console.log("TTS not supported in this browser");
}

// List available voices
window.speechSynthesis.getVoices().forEach(voice => {
  console.log(voice.name, voice.lang);
});
```