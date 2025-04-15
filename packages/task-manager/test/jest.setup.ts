// Add any global test setup here
import { jest } from '@jest/globals';

// Set default timeout for all tests
jest.setTimeout(30000);

// Add any global mocks or setup needed for all tests

// Mock the TwitterClient module that's causing the issue
// jest.mock('@elizaos/client-twitter', () => ({
//   TwitterClient: jest.fn(),
//   TwitterClientStatus: {
//     CONNECTED: 'connected',
//     DISCONNECTED: 'disconnected'
//   }
// }));
