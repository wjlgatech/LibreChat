// Test Speech Recognition in Browser Console
// Copy and paste this entire script into the browser console

console.log('=== Testing Speech Recognition ===');

// Check if speech recognition is available
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
console.log('SpeechRecognition available:', !!SpeechRecognition);

if (SpeechRecognition) {
  console.log('Creating recognition instance...');
  const recognition = new SpeechRecognition();
  
  // Configure recognition
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
  console.log('Recognition configured:', {
    continuous: recognition.continuous,
    interimResults: recognition.interimResults,
    lang: recognition.lang
  });
  
  // Set up event handlers
  recognition.onstart = () => {
    console.log('✅ Recognition started - speak now!');
  };
  
  recognition.onresult = (event) => {
    console.log('📝 Recognition result:', event);
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        console.log('🎯 Final transcript:', result[0].transcript);
      } else {
        console.log('💬 Interim transcript:', result[0].transcript);
      }
    }
  };
  
  recognition.onerror = (event) => {
    console.error('❌ Recognition error:', event.error, event);
  };
  
  recognition.onend = () => {
    console.log('🛑 Recognition ended');
  };
  
  // Try to start recognition
  try {
    console.log('Starting recognition...');
    recognition.start();
    console.log('Recognition should be active now. Speak into your microphone!');
    console.log('To stop, run: recognition.stop()');
    
    // Make recognition available globally for manual control
    window.testRecognition = recognition;
  } catch (error) {
    console.error('❌ Failed to start recognition:', error);
  }
} else {
  console.error('❌ Speech Recognition not supported in this browser');
}

// Test microphone permissions
console.log('\n=== Testing Microphone Access ===');
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    console.log('✅ Microphone access granted');
    // Stop the stream immediately
    stream.getTracks().forEach(track => track.stop());
  })
  .catch(error => {
    console.error('❌ Microphone access denied:', error);
  });