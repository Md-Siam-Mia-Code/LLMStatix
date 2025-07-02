import React, { useState, useMemo, useEffect, useRef } from 'react';
import './App.css';
import { MemoryMode, ModelQuantization, KvCacheQuantization } from './types';
import {
  calculateHardwareRecommendation,
  calculateOnDiskSize,
} from './calculations';

// --- Reusable Custom Dropdown Component ---
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
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="form-group" ref={dropdownRef}>
      <label>{label}</label>
      <div className="custom-dropdown">
        <button
          className={`dropdown-header ${isOpen ? 'open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <i className={iconClass}></i>
          <span>{selectedLabel}</span>
          <i
            className={`fas fa-chevron-down dropdown-arrow ${isOpen ? 'open' : ''}`}
          ></i>
        </button>
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

// --- Reusable Number Input Component ---
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
    <div className="input-group">
      <i className={iconClass}></i>
      <input type="number" value={value} onChange={onChange} {...props} />
    </div>
  </div>
);

// --- Gauge Component ---
const VramGauge = ({
  vramNeeded,
  gpuVram,
}: {
  vramNeeded: number;
  gpuVram: number;
}) => {
  const radius = 85;
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
        <p className="gauge-label">VRAM Needed</p>
      </div>
    </div>
  );
};

// --- Main App Component ---
function App() {
  const [params, setParams] = useState<number>(8);
  const [modelQuant, setModelQuant] = useState<ModelQuantization>('Q4');
  const [contextLength, setContextLength] = useState<number>(8192);
  const [memoryMode, setMemoryMode] = useState<MemoryMode>('DISCRETE_GPU');
  const [gpuVram, setGpuVram] = useState<number>(24);

  const { recommendation, onDiskSize } = useMemo(() => {
    const systemMemory = memoryMode === 'UNIFIED_MEMORY' ? gpuVram : 128;
    const rec = calculateHardwareRecommendation(
      params,
      modelQuant,
      contextLength,
      true,
      'Q8',
      memoryMode,
      systemMemory,
      gpuVram,
      'incremental'
    );
    const disk = calculateOnDiskSize(params, modelQuant);
    return { recommendation: rec, onDiskSize: disk };
  }, [params, modelQuant, contextLength, memoryMode, gpuVram]);

  return (
    <div className="App">
      <header className="app-header">
        <h1>LLM Hardware Calculator</h1>
        <p>A refined tool to estimate hardware needs for LLM inference.</p>
      </header>

      <div className="calculator-layout">
        <div className="input-panel">
          {/* Model Configuration Group */}
          <div className="config-group">
            <div className="config-group-header">
              <i className="fas fa-robot"></i>
              <h2>Model</h2>
            </div>
            <div className="config-grid">
              <NumberInput
                label="Parameters (B)"
                iconClass="fas fa-microchip"
                value={params}
                onChange={(e) => setParams(Number(e.target.value))}
                min="1"
              />
              <CustomDropdown
                label="Quantization"
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
            </div>
          </div>

          {/* Hardware & Context Group */}
          <div className="config-group">
            <div className="config-group-header">
              <i className="fas fa-desktop"></i>
              <h2>Hardware & Context</h2>
            </div>
            <div className="config-grid">
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
                label={
                  memoryMode === 'DISCRETE_GPU' ? 'GPU VRAM' : 'System RAM'
                }
                iconClass="fas fa-memory"
                selectedValue={String(gpuVram)}
                onSelect={(val) => setGpuVram(Number(val))}
                options={[
                  { value: '8', label: '8 GB' },
                  { value: '12', label: '12 GB' },
                  { value: '16', label: '16 GB' },
                  { value: '24', label: '24 GB' },
                  { value: '32', label: '32 GB' },
                  { value: '48', label: '48 GB' },
                  { value: '64', label: '64 GB' },
                  { value: '96', label: '96 GB' },
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
            </div>
          </div>
        </div>

        <div className="results-panel">
          <VramGauge
            vramNeeded={parseFloat(recommendation.vramNeeded)}
            gpuVram={gpuVram}
          />
          <div className="results-grid">
            <div className="stat">
              <h3>
                <i className="fas fa-hdd"></i> Disk Size
              </h3>
              <p>{onDiskSize.toFixed(2)} GB</p>
            </div>
            <div className="stat">
              <h3>
                <i className="fas fa-layer-group"></i> GPU Setup
              </h3>
              <p>
                {recommendation.gpusRequired > 1
                  ? `${recommendation.gpusRequired}x GPUs`
                  : `Single GPU`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
