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

// --- DATA (Updated with Data Center GPUs) ---
const GPU_DATA = [
  { vram: 8, bandwidth: 448 }, // RTX 4060 Ti
  { vram: 12, bandwidth: 717 }, // RTX 4070 Ti
  { vram: 16, bandwidth: 737 }, // RTX 4080
  { vram: 24, bandwidth: 1008 }, // RTX 4090
  { vram: 32, bandwidth: 1210 }, // RTX 6000 Ada (for a workstation example)
  { vram: 40, bandwidth: 1555 }, // A100 (SXM4) 40GB
  { vram: 48, bandwidth: 1920 }, // RTX A6000 Ada
  { vram: 80, bandwidth: 3350 }, // H100 (SXM5) 80GB
];

const CLOUD_INSTANCES = [
  {
    provider: 'AWS',
    instance: 'g4dn.xlarge',
    gpu: 'NVIDIA T4',
    vram: 16,
    hourlyCost: 0.526,
  },
  {
    provider: 'AWS',
    instance: 'g5.2xlarge',
    gpu: 'NVIDIA A10G',
    vram: 24,
    hourlyCost: 1.006,
  },
  {
    provider: 'GCP',
    instance: 'a2-highgpu-1g',
    gpu: 'NVIDIA A100',
    vram: 40,
    hourlyCost: 3.22,
  },
  {
    provider: 'AWS',
    instance: 'p4d.24xlarge',
    gpu: 'NVIDIA A100',
    vram: 40,
    hourlyCost: 32.77,
  },
  {
    provider: 'AWS',
    instance: 'p5.48xlarge',
    gpu: 'NVIDIA H100',
    vram: 80,
    hourlyCost: 98.32,
  },
];

// --- HELPERS ---
export const getModelQuantFactor = (q: ModelQuantization): number => {
  const factors = {
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
  };
  return factors[q] || 1.0;
};
export const getKvCacheQuantFactor = (k: KvCacheQuantization): number =>
  getModelQuantFactor(k as any);
export const calculateOnDiskSize = (p: number, q: ModelQuantization): number =>
  p * getModelQuantFactor(q);

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

export const calculatePerformance = (
  params: number,
  modelQuant: ModelQuantization,
  gpuVram: number
): PerformanceMetrics => {
  const gpu = GPU_DATA.find((g) => g.vram === gpuVram) || GPU_DATA[0];
  const bytesPerParam = getModelQuantFactor(modelQuant);
  const bytesPerToken = params * 1e9 * bytesPerParam;
  const theoreticalTokensPerSecond = (gpu.bandwidth * 1e9) / bytesPerToken;
  const efficiencyFactor = 0.35;
  const tokensPerSecond = theoreticalTokensPerSecond * efficiencyFactor;
  return { tokensPerSecond: parseFloat(tokensPerSecond.toFixed(1)) };
};

export const calculateCloudCost = (
  vramNeeded: number,
  gpusRequired: number
): CloudCost | null => {
  if (gpusRequired > 1) {
    const suitableInstance = CLOUD_INSTANCES.find((i) => i.vram >= vramNeeded);
    if (!suitableInstance) return null;
    return {
      ...suitableInstance,
      monthlyCost: parseFloat(
        (suitableInstance.hourlyCost * gpusRequired * 730).toFixed(0)
      ),
    };
  }
  const suitableInstance = CLOUD_INSTANCES.sort(
    (a, b) => a.hourlyCost - b.hourlyCost
  ).find((i) => i.vram >= vramNeeded);
  if (!suitableInstance) return null;
  return {
    ...suitableInstance,
    monthlyCost: parseFloat((suitableInstance.hourlyCost * 730).toFixed(0)),
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
