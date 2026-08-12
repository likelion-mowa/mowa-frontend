// Re-export the native module. On web, it will be resolved to WalkDetectorModule.web.ts
// and on native platforms to WalkDetectorModule.ts
export { default } from './src/WalkDetectorModule';
export * from './src/WalkDetector.types';
