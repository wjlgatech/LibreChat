const path = require('path');
const fs = require('fs');

// Simple bundler for mediasoup-client
const mediasoupClientPath = require.resolve('mediasoup-client');
const mediasoupDir = path.dirname(mediasoupClientPath);

// Read the main mediasoup-client files
const files = [
  'Device.js',
  'Transport.js',
  'Producer.js',
  'Consumer.js',
  'DataProducer.js',
  'DataConsumer.js',
  'EnhancedEventEmitter.js',
  'Logger.js',
  'utils.js',
  'ortc.js',
  'scalabilityModes.js',
  'handlers/Handler.js',
  'handlers/Chrome111.js',
  'handlers/Chrome74.js',
  'handlers/Chrome70.js',
  'handlers/Chrome67.js',
  'handlers/Chrome55.js',
  'handlers/Edge11.js',
  'handlers/Firefox120.js',
  'handlers/Firefox60.js',
  'handlers/ReactNativeUnifiedPlan.js',
  'handlers/Safari12.js',
  'handlers/Safari11.js',
];

// Create a simple bundle
let bundle = `
// MediaSoup Client Bundle
(function(global) {
  const exports = {};
  const module = { exports };
  
`;

// Add mediasoup-client index
try {
  const indexContent = fs.readFileSync(path.join(mediasoupDir, 'index.js'), 'utf8');
  bundle += `
  // Main mediasoup-client module
  ${indexContent}
  
  // Export to global
  global.mediasoupClient = module.exports;
  
`;
} catch (err) {
  console.error('Error reading mediasoup-client:', err);
}

bundle += `
})(window);
`;

// Write bundle
fs.writeFileSync(path.join(__dirname, 'src', 'mediasoup-bundle.js'), bundle);
console.log('Created mediasoup-bundle.js');