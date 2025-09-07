# Voice Recognition Debugging Guide

## Current Issue
Speech recognition starts but immediately ends without capturing any speech.

## Fixes Applied
1. **Fixed AI response detection**: Changed from using `latestMessage` to searching through all messages for the latest AI response with non-empty text
2. **Fixed recognition restart logic**: Added proper checks to prevent restart loops while maintaining continuous mode
3. **Removed circular dependency**: Removed `isWaitingForResponse` from startListening dependencies

## Test Files Created

### 1. Basic HTML Test
Open `/Users/paulwu/Projects/LibreChat/TEST_BASIC_SPEECH.html` in Chrome to test speech recognition in isolation.

### 2. Chrome Debug Script
Run this in Chrome DevTools console:
```javascript
// Copy and paste the contents of TEST_CHROME_DEBUG.js
```

### 3. Simple Microphone Test  
```javascript
// Copy and paste the contents of TEST_MIC_SIMPLE.js
```

## Debugging Steps

1. **Check Chrome Settings**:
   - Go to chrome://settings/content/microphone
   - Ensure localhost:3090 is allowed
   - Check that correct microphone is selected

2. **Test in Browser Console**:
   ```javascript
   // Quick test - run this in console
   const r = new webkitSpeechRecognition();
   r.onresult = (e) => console.log('Heard:', e.results[0][0].transcript);
   r.onerror = (e) => console.error('Error:', e.error);
   r.start();
   ```

3. **Common Issues**:
   - **Auto-play restrictions**: Chrome may block audio/microphone without user interaction
   - **Multiple tabs**: Close other tabs using microphone
   - **Extensions**: Disable extensions that might interfere with microphone
   - **HTTPS requirement**: Ensure using localhost or HTTPS

4. **If still not working**:
   - Try incognito mode
   - Check Activity Monitor for high CPU usage
   - Restart Chrome
   - Check System Preferences > Security & Privacy > Microphone

## Expected Console Output
When working correctly, you should see:
```
[VoiceUnified] Button clicked, isActive: false
[VoiceUnified] Activating continuous voice mode
[VoiceUnified] Creating new SpeechRecognition instance
[VoiceUnified] Recognition configured: {continuous: true, interimResults: true, lang: "en-US", maxAlternatives: 1}
[VoiceUnified] Calling recognition.start()
[VoiceUnified] Recognition started
[VoiceUnified] Audio capture started
[VoiceUnified] Speech detected - user is speaking
[VoiceUnified] Recognition result event
[VoiceUnified] Transcript: [your speech here]
```