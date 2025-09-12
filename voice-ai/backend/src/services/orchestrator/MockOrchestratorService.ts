import { OrchestratorService, OrchestratorConfig } from './OrchestratorService';

/**
 * Mock Orchestrator Service for testing without API keys
 */
export class MockOrchestratorService extends OrchestratorService {
  constructor(config: OrchestratorConfig) {
    super(config);
  }

  /**
   * Override getLLMResponse to return mock responses
   */
  protected async getLLMResponse(userInput: string): Promise<string> {
    console.log('[MockOrchestrator] Generating mock response for:', userInput);
    
    // Simulate LLM delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Generate mock responses based on input
    const mockResponses: { [key: string]: string } = {
      'hello': 'Hello! How can I help you today?',
      'how are you': "I'm doing great, thank you for asking! How are you?",
      'test': 'This is a test response from the mock orchestrator.',
      'weather': "I'm a mock service, but I'd imagine the weather is lovely!",
      'time': `The current time is ${new Date().toLocaleTimeString()}.`,
      'help': 'I can help you test the voice AI pipeline without API keys!',
    };

    // Find a matching response or return a default
    const lowerInput = userInput.toLowerCase();
    for (const [key, response] of Object.entries(mockResponses)) {
      if (lowerInput.includes(key)) {
        return response;
      }
    }

    // Default response
    return `I heard you say: "${userInput}". This is a mock response for testing.`;
  }
}

// Export a flag to check if we're in mock mode
export const isMockMode = () => {
  return !process.env.OPENAI_API_KEY || 
         process.env.OPENAI_API_KEY === 'your-openai-key-here' ||
         process.env.MOCK_MODE === 'true';
};