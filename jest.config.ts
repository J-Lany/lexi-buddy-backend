import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^auth/(.*)$': '<rootDir>/src/auth/$1',
    '^mail/(.*)$': '<rootDir>/src/mail/$1',
    '^repositories/(.*)$': '<rootDir>/src/repositories/$1',
    '^prisma/(.*)$': '<rootDir>/src/prisma/$1',
    '^notifications/(.*)$': '<rootDir>/src/notifications/$1',
  },
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  clearMocks: true,
  coverageProvider: 'v8',
};

export default config;
