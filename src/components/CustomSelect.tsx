'use client';

import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string | number;
  onChange: (value: any) => void;
  label: string;
  className?: string;
  maxWidthClass?: string;
}

export default function CustomSelect({
  options,
  value,
  onChange,
  label,
  className = '',
  maxWidthClass = 'min-w-[120px]'
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400/70 transition-all duration-200 cursor-pointer ${maxWidthClass}`}
      >
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0">{label}</span>
        <span className="text-xs font-bold text-slate-700 truncate">{selectedOption?.label}</span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ml-auto ${
            isOpen ? 'rotate-180 text-indigo-500' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 z-50 py-1.5 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 max-h-64 overflow-y-auto custom-scrollbar min-w-full w-max max-w-[280px]">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-xs font-semibold flex items-center justify-between transition-colors duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
