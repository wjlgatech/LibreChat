// Test JWT validation in LibreChat
const jwt = require('jsonwebtoken');

// Get these values from your .env file
const JWT_SECRET = process.env.JWT_SECRET || '16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef';

function testJWTToken(token) {
  console.log('Testing JWT Token\n');
  console.log('=================\n');
  
  if (!token) {
    console.log('No token provided!');
    console.log('\nTo get a token:');
    console.log('1. Login to LibreChat in your browser');
    console.log('2. Open DevTools Console (F12)');
    console.log('3. Run: localStorage.getItem("token")');
    console.log('4. Copy the token and pass it to this script');
    return;
  }
  
  console.log('Token:', token.substring(0, 50) + '...\n');
  
  try {
    // Try to decode without verification first
    console.log('1. Decoding token (without verification):');
    const decoded = jwt.decode(token);
    console.log('Decoded payload:', JSON.stringify(decoded, null, 2));
    
    if (decoded) {
      // Check expiration
      if (decoded.exp) {
        const expDate = new Date(decoded.exp * 1000);
        const now = new Date();
        console.log('\n2. Token expiration:');
        console.log('Expires at:', expDate.toISOString());
        console.log('Current time:', now.toISOString());
        console.log('Expired?', now > expDate);
      }
      
      // Check issued at
      if (decoded.iat) {
        const iatDate = new Date(decoded.iat * 1000);
        console.log('\n3. Token issued at:', iatDate.toISOString());
      }
      
      // Try to verify with secret
      console.log('\n4. Verifying token with JWT_SECRET...');
      if (JWT_SECRET === 'your-secret-here') {
        console.log('⚠️  JWT_SECRET not set! Update this script with your JWT_SECRET from .env');
      } else {
        try {
          const verified = jwt.verify(token, JWT_SECRET);
          console.log('✅ Token is valid!');
          console.log('User ID:', verified.id || verified.sub || 'Not found');
        } catch (verifyError) {
          console.log('❌ Token verification failed:', verifyError.message);
        }
      }
    }
    
  } catch (error) {
    console.error('Error decoding token:', error.message);
  }
}

// Get token from command line argument
const token = process.argv[2];

if (!token) {
  console.log('Usage: node test-jwt-validation.js <your-jwt-token>');
  console.log('\nExample:');
  console.log('node test-jwt-validation.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
} else {
  testJWTToken(token);
}