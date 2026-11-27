/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^\\./project-execution-choice\\.js$": "<rootDir>/../backend/src/contracts/project-execution-choice.ts",
    "^(?:\\.\\./\\.\\./backend/src/domain/|\\./)(estimate-pmc-payment-split|estimate-pmc-payable|estimate-gst-presentation|ai-estimator-knowledge-mode-calculation|ai-estimator-knowledge-calculation|knowledge-pricing-constants)\\.js$": "<rootDir>/../backend/src/domain/$1.ts"
  },
  modulePaths: ["<rootDir>/node_modules"],
  setupFilesAfterEnv: ["<rootDir>/test-support/setup.ts"],
  testMatch: ["<rootDir>/**/*.test.ts", "<rootDir>/**/*.test.tsx"],
  testPathIgnorePatterns: ["/node_modules/", "/e2e/", "/dist/"],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"]
};
