// Chrome Speech Recognition Debug Script
// Run this in Chrome DevTools console

console.log('=== Chrome Speech Recognition Debug ===');
console.log('User Agent:', navigator.userAgent);
console.log('Secure Context:', window.isSecureContext);
console.log('Protocol:', window.location.protocol);

// Check if speech recognition is available
const hasSpeechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
console.log('Speech Recognition Available:', hasSpeechRecognition);

if (hasSpeechRecognition) {
  console.log('Using:', window.SpeechRecognition ? 'SpeechRecognition' : 'webkitSpeechRecognition');
  
  // Test basic instantiation
  try {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const testRec = new SpeechRecognition();
    console.log('✅ Can create recognition instance');
    console.log('Default properties:', {
      continuous: testRec.continuous,
      interimResults: testRec.interimResults,
      maxAlternatives: testRec.maxAlternatives,
      lang: testRec.lang
    });
  } catch (e) {
    console.error('❌ Cannot create recognition instance:', e);
  }
}

// Check microphone permissions
async function checkPermissions() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    console.log('Microphone Permission State:', result.state);
    
    result.onchange = () => {
      console.log('Permission changed to:', result.state);
    };
  } catch (e) {
    console.log('Cannot query permissions (normal in some browsers):', e.message);
  }
}

checkPermissions();

// Test with a minimal recognition instance
console.log('\n=== Starting minimal test ===');
console.log('Creating recognition with minimal config...');

try {
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.continuous = false; // Single result only
  recognition.interimResults = false; // Final results only
  
  recognition.onstart = () => console.log('✅ Started successfully');
  recognition.onend = () => console.log('🏁 Ended');
  recognition.onerror = (e) => console.error('❌ Error:', e.error);
  recognition.onresult = (e) => console.log('🎤 Result:', e.results[0][0].transcript);
  
  recognition.start();
  console.log('Recognition started - speak within 5 seconds...');
  
  setTimeout(() => {
    recognition.stop();
    console.log('Stopped after 5 seconds');
  }, 5000);
} catch (e) {
  console.error('Failed to start recognition:', e);
}