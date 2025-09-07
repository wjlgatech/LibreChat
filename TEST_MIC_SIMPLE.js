// Simple microphone test
async function testMic() {
  console.log('Testing microphone...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('SUCCESS: Microphone permission granted!');
    console.log('Audio tracks:', stream.getAudioTracks());
    
    // Test audio levels
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    microphone.connect(analyser);
    
    console.log('Listening for 3 seconds... Please speak!');
    let maxLevel = 0;
    
    const checkLevel = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const level = Math.max(...dataArray);
      if (level > maxLevel) {
        maxLevel = level;
        console.log('Audio level:', level);
      }
    }, 100);
    
    setTimeout(() => {
      clearInterval(checkLevel);
      stream.getTracks().forEach(track => track.stop());
      console.log('Test complete. Max audio level:', maxLevel);
      if (maxLevel > 0) {
        console.log('SUCCESS: Microphone is working!');
      } else {
        console.log('WARNING: No audio detected');
      }
    }, 3000);
    
  } catch (error) {
    console.error('ERROR: Microphone access denied:', error);
  }
}

testMic();