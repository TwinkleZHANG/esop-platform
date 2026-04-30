import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/src/lib/__tests__/jest.setup.ts"],
  // 多个测试文件共用同一 PostgreSQL test DB；并行写会互相清表导致 FK 错误
  maxWorkers: 1,
};

export default config;
