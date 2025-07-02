/** Memory mode: discrete GPU or unified memory. */
export type MemoryMode = 'DISCRETE_GPU' | 'UNIFIED_MEMORY';

/** Model quantization set: F32, F16, Q8, Q6, Q5, Q4, Q3, Q2, GPTQ, AWQ. */
export type ModelQuantization =
  | 'F32'
  | 'F16'
  | 'Q8'
  | 'Q6'
  | 'Q5'
  | 'Q4'
  | 'Q3'
  | 'Q2'
  | 'GPTQ'
  | 'AWQ';

/** KV cache quantization: F32, F16, Q8, Q5, Q4. */
export type KvCacheQuantization = 'F32' | 'F16' | 'Q8' | 'Q5' | 'Q4';

/** VRAM usage broken down by component. */
export interface VramBreakdown {
  modelWeights: number;
  kvCache: number;
  overhead: number;
  total: number;
}

/** Estimated performance metrics. */
export interface PerformanceMetrics {
  tokensPerSecond: number;
}

/** Estimated cloud hosting costs. */
export interface CloudCost {
  provider: string;
  instance: string;
  monthlyCost: number;
  gpuType: string;
}

/** Main recommendation object returned by the calculator. */
export interface Recommendation {
  gpuType: string;
  vramNeeded: VramBreakdown;
  fitsUnified: boolean;
  systemRamNeeded: number;
  gpusRequired: number;
  performance: PerformanceMetrics;
  cloudCost: CloudCost | null;
}
