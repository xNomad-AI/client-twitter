export default {
    // Specifies the test environment
    testEnvironment: 'node',

    // TypeScript support
    preset: 'ts-jest',
    transform: {
        '^.+\\.(t|j)sx?$': ['ts-jest', {
            useESM: true,
            tsconfig: 'tsconfig.json'
        }]
    },

    // Module file extensions
    moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],

    // Module name mapper for ESM imports
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },

    // The root directory for tests
    rootDir: '.',

    // Test file patterns
    testMatch: [
        '<rootDir>/test/**/*.test.ts',
        '<rootDir>/src/**/*.test.ts'
    ],

    // Coverage configuration
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/test/',
        '.turbo'
    ],
    coverageReporters: ['text', 'lcov', 'clover'],

    // Setup and teardown
    setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],

    // Important for your project's ESM setup
    extensionsToTreatAsEsm: ['.ts'],

    // Test environment settings
    testTimeout: 30000,

    // Clear mocks between tests
    clearMocks: true,

    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '.turbo'
    ]
};