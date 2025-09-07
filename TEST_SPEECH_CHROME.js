// Test speech recognition directly in Chrome
// This tests if speech recognition works at all in your browser

const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'en-US';

console.log('Setting up speech recognition...');

recognition.onstart = () => {
  console.log('Recognition started - speak now!');
};

recognition.onresult = (event) => {
  const last = event.results.length - 1;
  const transcript = event.results[last][0].transcript;
  console.log('Heard:', transcript);
  
  if (event.results[last].isFinal) {
    console.log('Final transcript:', transcript);
  }
};

recognition.onerror = (event) => {
  console.error('Error:', event.error);
  if (event.error === 'no-speech') {
    console.log('No speech detected - make sure to speak clearly');
  }
};

recognition.onend = () => {
  console.log('Recognition ended');
};

// Start recognition
try {
  recognition.start();
  console.log('Speech recognition started successfully');
  console.log('Try saying something...');
  
  // Stop after 10 seconds
  setTimeout(() => {
    recognition.stop();
    console.log('Stopped after 10 seconds');
  }, 10000);
} catch (e) {
  console.error('Failed to start:', e);
}