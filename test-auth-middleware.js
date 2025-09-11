// Test authentication middleware flow
const express = require('express');
const axios = require('axios');

async function testAuthMiddleware() {
  console.log('Testing Authentication Middleware Flow\n');
  console.log('=====================================\n');
  
  // Create a simple test server to understand the middleware flow
  const app = express();
  const port = 3091; // Different port to avoid conflicts
  
  // Logging middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Headers:', {
      authorization: req.headers.authorization ? 'Present' : 'Missing',
      cookie: req.headers.cookie ? 'Present' : 'Missing',
    });
    next();
  });
  
  // Simulated JWT auth middleware
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      console.log('Token found:', token.substring(0, 20) + '...');
      // Simulate user population
      req.user = { id: 'test-user-123', username: 'testuser' };
      console.log('User populated:', req.user);
    } else {
      console.log('No valid auth header found');
    }
    next();
  });
  
  // Test endpoint
  app.post('/test-tts', (req, res) => {
    console.log('TTS endpoint reached');
    console.log('req.user:', req.user);
    res.json({ 
      success: true, 
      hasUser: !!req.user,
      userId: req.user?.id 
    });
  });
  
  const server = app.listen(port, () => {
    console.log(`Test server listening on port ${port}\n`);
  });
  
  // Run tests
  try {
    // Test 1: No auth
    console.log('Test 1: Request without authentication');
    console.log('--------------------------------------');
    const test1 = await axios.post(`http://localhost:${port}/test-tts`, {});
    console.log('Response:', test1.data);
    console.log();
    
    // Test 2: With auth
    console.log('Test 2: Request with Bearer token');
    console.log('---------------------------------');
    const test2 = await axios.post(`http://localhost:${port}/test-tts`, {}, {
      headers: {
        'Authorization': 'Bearer fake-jwt-token-12345'
      }
    });
    console.log('Response:', test2.data);
    
  } catch (error) {
    console.error('Test error:', error.message);
  } finally {
    server.close();
    console.log('\nTest server closed');
  }
}

testAuthMiddleware().catch(console.error);