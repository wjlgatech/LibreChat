// Test microphone permissions and speech recognition
// Run this in the browser console to debug

async function testMicrophone() {
  console.log('=== Testing Microphone Permissions ===');
  
  try {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('✅ Microphone permission granted!');
    console.log('Audio tracks:', stream.getAudioTracks());
    
    // Test if audio is actually working
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    microphone.connect(analyser);
    
    // Check audio levels
    let maxLevel = 0;
    const checkLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const level = Math.max(...dataArray);
      if (level > maxLevel) {
        maxLevel = level;
        console.log('🎤 Audio level detected:', level);
      }
    };
    
    // Check levels for 3 seconds
    console.log('🎤 Listening for audio levels for 3 seconds... Make some noise!');
    const interval = setInterval(checkLevel, 100);
    
    setTimeout(() => {
      clearInterval(interval);
      stream.getTracks().forEach(track => track.stop());
      console.log('🎤 Max audio level detected:', maxLevel);
      if (maxLevel > 0) {
        console.log('✅ Microphone is working properly!');
      } else {
        console.log('⚠️ No audio detected - check your microphone');
      }
    }, 3000);
    
  } catch (error) {
    console.error('❌ Microphone permission denied or error:', error);
    console.log('Please check:');
    console.log('1. Click the microphone icon in the address bar');
    console.log('2. Allow microphone access for this site');
    console.log('3. Make sure your microphone is not muted');
  }
}

// Run the test
testMicrophone();