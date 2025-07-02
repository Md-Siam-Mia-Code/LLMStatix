import React, { useState, useMemo, useEffect, useRef } from 'react';
import './App.css';
import { MemoryMode, ModelQuantization, KvCacheQuantization } from './types';
import { calculateHardwareRecommendation } from './calculations';

// --- Reusable Components ---
const CustomDropdown = ({
  label,
  iconClass,
  options,
  selectedValue,
  onSelect,
}: {
  label: string;
  iconClass: string;
  options: { value: string; label: string }[];
  selectedValue: string;
  onSelect: (value: any) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(
    (opt) => opt.value === selectedValue
  )?.label;
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      )
        setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="custom-dropdown" ref={dropdownRef}>
        <div
          className={`input-base dropdown-header ${isOpen ? 'open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <i className={iconClass}></i>
          <span>{selectedLabel}</span>
          <i
            className={`fas fa-chevron-down dropdown-arrow ${isOpen ? 'open' : ''}`}
          ></i>
        </div>
        <div className={`dropdown-list-container ${isOpen ? 'open' : ''}`}>
          <ul className="dropdown-list">
            {options.map((option) => (
              <li
                key={option.value}
                className={`dropdown-item ${selectedValue === option.value ? 'selected' : ''}`}
                onClick={() => {
                  onSelect(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
const NumberInput = ({
  label,
  iconClass,
  value,
  onChange,
  ...props
}: {
  label: string;
  iconClass: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  [key: string]: any;
}) => (
  <div className="form-group">
    <label>{label}</label>
    <div className="input-base">
      <i className={iconClass}></i>
      <input type="number" value={value} onChange={onChange} {...props} />
    </div>
  </div>
);
const VramGauge = ({
  vramNeeded,
  gpuVram,
}: {
  vramNeeded: number;
  gpuVram: number;
}) => {
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const usagePercentage = Math.min(100, (vramNeeded / gpuVram) * 100);
  const strokeDashoffset = circumference * (1 - usagePercentage / 100);

  return (
    <div className="vram-gauge">
      <svg viewBox="0 0 200 200" className="gauge-svg">
        <defs>
          <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d90429" />
            <stop offset="100%" stopColor="#ef233c" />
          </linearGradient>
        </defs>
        <circle className="gauge-track" cx="100" cy="100" r={radius} />
        <circle
          className="gauge-fill"
          cx="100"
          cy="100"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="gauge-text">
        <p className="gauge-value">
          {vramNeeded.toFixed(2)}
          <span>GB</span>
        </p>
        <p className="gauge-percentage">
          {usagePercentage.toFixed(0)}% of {gpuVram}GB used
        </p>
      </div>
    </div>
  );
};

// --- Main App Component ---
function App() {
  const [params, setParams] = useState(
    () => Number(new URLSearchParams(window.location.search).get('p')) || 8
  );
  const [modelQuant, setModelQuant] = useState<ModelQuantization>(
    () =>
      (new URLSearchParams(window.location.search).get(
        'q'
      ) as ModelQuantization) || 'Q4'
  );
  const [contextLength, setContextLength] = useState(
    () => Number(new URLSearchParams(window.location.search).get('c')) || 8192
  );
  const [memoryMode, setMemoryMode] = useState<MemoryMode>(
    () =>
      (new URLSearchParams(window.location.search).get('m') as MemoryMode) ||
      'DISCRETE_GPU'
  );
  const [gpuVram, setGpuVram] = useState(
    () => Number(new URLSearchParams(window.location.search).get('v')) || 24
  );
  const [batchSize, setBatchSize] = useState(
    () => Number(new URLSearchParams(window.location.search).get('b')) || 1
  );
  const [inferenceMode, setInferenceMode] = useState<'incremental' | 'bulk'>(
    () =>
      (new URLSearchParams(window.location.search).get('i') as
        | 'incremental'
        | 'bulk') || 'incremental'
  );
  const [kvCacheQuant, setKvCacheQuant] = useState<KvCacheQuantization>(
    () =>
      (new URLSearchParams(window.location.search).get(
        'k'
      ) as KvCacheQuantization) || 'Q8'
  );
  const [shareButtonText, setShareButtonText] = useState('Share');

  const recommendation = useMemo(() => {
    const systemMemory = memoryMode === 'UNIFIED_MEMORY' ? gpuVram : 128;
    return calculateHardwareRecommendation(
      params,
      modelQuant,
      contextLength,
      kvCacheQuant,
      memoryMode,
      systemMemory,
      gpuVram,
      inferenceMode,
      batchSize
    );
  }, [
    params,
    modelQuant,
    contextLength,
    kvCacheQuant,
    memoryMode,
    gpuVram,
    inferenceMode,
    batchSize,
  ]);

  const handleShare = () => {
    const stateParams = new URLSearchParams({
      p: String(params),
      q: modelQuant,
      c: String(contextLength),
      m: memoryMode,
      v: String(gpuVram),
      b: String(batchSize),
      i: inferenceMode,
      k: kvCacheQuant,
    });
    const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${stateParams.toString()}`;
    navigator.clipboard.writeText(newUrl).then(() => {
      setShareButtonText('Copied!');
      setTimeout(() => setShareButtonText('Share'), 2000);
    });
  };

  return (
    <div className="App">
      <div className="config-panel">
        <header className="config-header">
          <h1>Hardware Calculator</h1>
          <p>Estimate hardware for LLM inference.</p>
          <button className="share-button" onClick={handleShare}>
            <i className="fas fa-link"></i>
            {shareButtonText}
          </button>
        </header>
        <main>
          <NumberInput
            label="Parameters (B)"
            iconClass="fas fa-microchip"
            value={params}
            onChange={(e) => setParams(Number(e.target.value))}
            min="1"
          />
          <CustomDropdown
            label="Model Quantization"
            iconClass="fas fa-layer-group"
            selectedValue={modelQuant}
            onSelect={setModelQuant}
            options={[
              { value: 'F16', label: 'FP16' },
              { value: 'Q8', label: 'Q8 (8-bit)' },
              { value: 'Q5', label: 'Q5 (5-bit)' },
              { value: 'Q4', label: 'Q4 (4-bit)' },
            ]}
          />
          <NumberInput
            label="Context Length"
            iconClass="fas fa-file-alt"
            value={contextLength}
            onChange={(e) => setContextLength(Number(e.target.value))}
            min="512"
            step="512"
          />
          <NumberInput
            label="Batch Size"
            iconClass="fas fa-box"
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            min="1"
          />
          <CustomDropdown
            label="Hardware Type"
            iconClass="fas fa-server"
            selectedValue={memoryMode}
            onSelect={setMemoryMode}
            options={[
              { value: 'DISCRETE_GPU', label: 'Discrete GPU' },
              { value: 'UNIFIED_MEMORY', label: 'Unified Memory' },
            ]}
          />
          <CustomDropdown
            label={memoryMode === 'DISCRETE_GPU' ? 'GPU VRAM' : 'System RAM'}
            iconClass="fas fa-sd-card"
            selectedValue={String(gpuVram)}
            onSelect={(val) => setGpuVram(Number(val))}
            options={[
              { value: '8', label: '8 GB (Consumer)' },
              { value: '12', label: '12 GB (Consumer)' },
              { value: '16', label: '16 GB (Consumer)' },
              { value: '24', label: '24 GB (Prosumer)' },
              { value: '32', label: '32 GB (Workstation)' },
              { value: '40', label: '40 GB (A100)' },
              { value: '48', label: '48 GB (Workstation)' },
              { value: '80', label: '80 GB (H100)' },
            ]}
          />
        </main>
      </div>
      <div className="results-panel">
        <VramGauge
          vramNeeded={recommendation.vramNeeded.total}
          gpuVram={gpuVram}
        />
        <main>
          <div className="vram-breakdown">
            <h3>VRAM Breakdown</h3>
            <div className="breakdown-row">
              <div
                className="breakdown-bar"
                style={{
                  width: `${(recommendation.vramNeeded.modelWeights / recommendation.vramNeeded.total) * 100}%`,
                }}
              ></div>
              <span className="breakdown-label">Model Weights</span>
              <span className="breakdown-value">
                {recommendation.vramNeeded.modelWeights.toFixed(2)} GB
              </span>
            </div>
            <div className="breakdown-row">
              <div
                className="breakdown-bar"
                style={{
                  width: `${(recommendation.vramNeeded.kvCache / recommendation.vramNeeded.total) * 100}%`,
                }}
              ></div>
              <span className="breakdown-label">KV Cache</span>
              <span className="breakdown-value">
                {recommendation.vramNeeded.kvCache.toFixed(2)} GB
              </span>
            </div>
            <div className="breakdown-row">
              <div
                className="breakdown-bar"
                style={{
                  width: `${(recommendation.vramNeeded.overhead / recommendation.vramNeeded.total) * 100}%`,
                }}
              ></div>
              <span className="breakdown-label">Overhead</span>
              <span className="breakdown-value">
                {recommendation.vramNeeded.overhead.toFixed(2)} GB
              </span>
            </div>
          </div>
          <div className="results-grid" style={{ marginTop: '2.5rem' }}>
            <div className="stat-card">
              <h3>
                <i className="fas fa-tachometer-alt"></i> Est. Speed
              </h3>
              <p>{recommendation.performance.tokensPerSecond} t/s</p>
            </div>
            <div className="stat-card">
              <h3>
                <i className="fas fa-layer-group"></i> GPU Setup
              </h3>
              <p className="small-text">{recommendation.gpuType}</p>
            </div>
          </div>
          {recommendation.cloudCost && (
            <div className="stat-card" style={{ marginTop: '1.5rem' }}>
              <h3>
                <i className="fas fa-cloud"></i> Est. Cloud Cost
              </h3>
              <p className="small-text">{`~ $${recommendation.cloudCost.monthlyCost}/mo (${recommendation.cloudCost.provider})`}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
