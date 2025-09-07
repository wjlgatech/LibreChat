// Test continuous recognition like the working version
console.log('Starting continuous recognition test...');

const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'en-US';

let isActive = true;
let isSpeaking = false;
let isWaitingForResponse = false;

recognition.onstart = () => {
  console.log('✅ Recognition started');
};

recognition.onresult = (event) => {
  console.log('📝 Result event - results:', event.results.length);
  let transcript = '';
  for (let i = event.resultIndex; i < event.results.length; i++) {
    if (event.results[i].isFinal) {
      transcript += event.results[i][0].transcript + ' ';
      console.log('Final:', event.results[i][0].transcript);
    } else {
      console.log('Interim:', event.results[i][0].transcript);
    }
  }
};

recognition.onerror = (event) => {
  console.error('❌ Error:', event.error);
  if (event.error === 'no-speech' && isActive && !isSpeaking) {
    console.log('Restarting after no-speech in 100ms...');
    setTimeout(() => recognition.start(), 100);
  }
};

recognition.onend = () => {
  console.log('🏁 Recognition ended');
  if (isActive && !isSpeaking && !isWaitingForResponse) {
    console.log('Restarting in 500ms...');
    setTimeout(() => recognition.start(), 500);
  }
};

// Add all event handlers
recognition.onaudiostart = () => console.log('🎤 Audio capture started');
recognition.onaudioend = () => console.log('🎤 Audio capture ended');
recognition.onspeechstart = () => console.log('🗣️ Speech detected');
recognition.onspeechend = () => console.log('🗣️ Speech ended');

// Start recognition
try {
  recognition.start();
  console.log('Recognition started. Speak something...');
  console.log('To stop: isActive = false');
} catch (e) {
  console.error('Failed to start:', e);
}