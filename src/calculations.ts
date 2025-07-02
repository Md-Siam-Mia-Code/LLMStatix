import {
  MemoryMode,
  ModelQuantization,
  KvCacheQuantization,
  Recommendation,
  VramBreakdown,
  PerformanceMetrics,
  CloudCost,
} from './types';

type InferenceMode = 'incremental' | 'bulk';

// --- DATA ---
const GPU_DATA = [
  { vram: 8, bandwidth: 448 },
  { vram: 12, bandwidth: 717 },
  { vram: 16, bandwidth: 737 },
  { vram: 24, bandwidth: 1008 },
  { vram: 32, bandwidth: 1210 },
  { vram: 40, bandwidth: 1555 },
  { vram: 48, bandwidth: 1920 },
  { vram: 80, bandwidth: 3350 },
];

const CLOUD_INSTANCES: (CloudCost & { vram: number; hourlyCost: number })[] = [
  {
    provider: 'AWS',
    instance: 'g4dn.xlarge',
    gpuType: 'NVIDIA T4',
    vram: 16,
    hourlyCost: 0.526,
    monthlyCost: 0,
  },
  {
    provider: 'AWS',
    instance: 'g5.2xlarge',
    gpuType: 'NVIDIA A10G',
    vram: 24,
    hourlyCost: 1.006,
    monthlyCost: 0,
  },
  {
    provider: 'GCP',
    instance: 'a2-highgpu-1g',
    gpuType: 'NVIDIA A100',
    vram: 40,
    hourlyCost: 3.22,
    monthlyCost: 0,
  },
  {
    provider: 'AWS',
    instance: 'p4d.24xlarge',
    gpuType: 'NVIDIA A100',
    vram: 40,
    hourlyCost: 32.77,
    monthlyCost: 0,
  },
  {
    provider: 'AWS',
    instance: 'p5.48xlarge',
    gpuType: 'NVIDIA H100',
    vram: 80,
    hourlyCost: 98.32,
    monthlyCost: 0,
  },
];

// --- HELPERS ---
const getModelQuantFactor = (q: ModelQuantization): number =>
  ({
    F16: 2.0,
    Q8: 1.0,
    Q6: 0.75,
    Q5: 0.625,
    Q4: 0.5,
    GPTQ: 0.6,
    AWQ: 0.6,
    F32: 4.0,
    Q3: 0.375,
    Q2: 0.25,
  })[q] || 1.0;

const getKvCacheQuantFactor = (k: KvCacheQuantization): number =>
  getModelQuantFactor(k as any);

// --- CORE CALCULATIONS ---
export const calculateVramUsage = (
  params: number,
  modelQuant: ModelQuantization,
  contextLength: number,
  kvCacheQuant: KvCacheQuantization,
  inferenceMode: InferenceMode,
  batchSize: number
): VramBreakdown => {
  const modelWeights = params * getModelQuantFactor(modelQuant);
  const kvFactor = getKvCacheQuantFactor(kvCacheQuant) / 2.0;
  let kvCache = params * 0.7 * (contextLength / 4096) * batchSize * kvFactor;
  if (inferenceMode === 'bulk') kvCache *= 1.5;
  const overhead = 1.0 + modelWeights * 0.05;
  const total = modelWeights + kvCache + overhead;
  return {
    modelWeights: parseFloat(modelWeights.toFixed(2)),
    kvCache: parseFloat(kvCache.toFixed(2)),
    overhead: parseFloat(overhead.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
  };
};

const calculatePerformance = (
  params: number,
  modelQuant: ModelQuantization,
  gpuVram: number
): PerformanceMetrics => {
  const gpu = GPU_DATA.find((g) => g.vram === gpuVram) || GPU_DATA[0];
  const bytesPerToken = params * 1e9 * getModelQuantFactor(modelQuant);
  const theoreticalTokensPerSecond = (gpu.bandwidth * 1e9) / bytesPerToken;
  const efficiencyFactor = 0.35;
  const tokensPerSecond = theoreticalTokensPerSecond * efficiencyFactor;
  return { tokensPerSecond: parseFloat(tokensPerSecond.toFixed(1)) };
};

const calculateCloudCost = (
  vramNeeded: number,
  gpusRequired: number
): CloudCost | null => {
  if (gpusRequired > 8) return null; // Not feasible for simple cost estimation
  const suitableInstances = CLOUD_INSTANCES.filter(
    (i) => i.vram * (gpusRequired > 1 ? 8 : 1) >= vramNeeded
  );
  if (suitableInstances.length === 0) return null;

  const cheapest = suitableInstances.sort(
    (a, b) => a.hourlyCost - b.hourlyCost
  )[0];
  return {
    provider: cheapest.provider,
    instance: cheapest.instance,
    monthlyCost: parseFloat(
      (
        cheapest.hourlyCost *
        (gpusRequired > 1 ? gpusRequired : 1) *
        730
      ).toFixed(0)
    ),
    gpuType: cheapest.gpuType,
  };
};

export const calculateHardwareRecommendation = (
  params: number,
  modelQuant: ModelQuantization,
  contextLength: number,
  kvCacheQuant: KvCacheQuantization,
  memoryMode: MemoryMode,
  systemMemory: number,
  gpuVram: number,
  inferenceMode: InferenceMode,
  batchSize: number
): Recommendation => {
  const vramNeeded = calculateVramUsage(
    params,
    modelQuant,
    contextLength,
    kvCacheQuant,
    inferenceMode,
    batchSize
  );
  const performance = calculatePerformance(params, modelQuant, gpuVram);
  const systemRamNeeded = Math.max(8, vramNeeded.total * 0.5);
  const fitsUnified =
    memoryMode === 'UNIFIED_MEMORY' && systemMemory >= vramNeeded.total;
  let gpusRequired = 0;
  let gpuType = '';

  if (memoryMode === 'DISCRETE_GPU') {
    gpusRequired = Math.ceil(vramNeeded.total / gpuVram);
    if (gpusRequired === 1) gpuType = `Single ${gpuVram}GB GPU`;
    else if (gpusRequired <= 8) gpuType = `${gpusRequired}x ${gpuVram}GB GPUs`;
    else {
      gpuType = `> 8 GPUs`;
      gpusRequired = Infinity;
    }
  } else {
    gpuType = fitsUnified
      ? `Fits in ${systemMemory}GB RAM`
      : `Exceeds ${systemMemory}GB RAM`;
  }

  const cloudCost = calculateCloudCost(vramNeeded.total, gpusRequired);

  return {
    gpuType,
    vramNeeded,
    fitsUnified,
    systemRamNeeded,
    gpusRequired,
    performance,
    cloudCost,
  };
};
