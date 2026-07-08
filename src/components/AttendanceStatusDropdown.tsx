'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { AttendanceStatus } from '@/types';
import { ATTENDANCE_STATUS_CONFIG } from '@/types';

interface AttendanceStatusDropdownProps {
  value: AttendanceStatus | '';
  onChange: (status: AttendanceStatus | '') => void;
  disabled?: boolean;
  compact?: boolean;
  onlyOffDay?: boolean;
  restrictedStatuses?: AttendanceStatus[];
  align?: 'left' | 'right' | 'center';
  placement?: 'top' | 'bottom';
  employeeGender?: 'male' | 'female' | 'other';
  wfhRestrictionReason?: string;
}

const statuses = Object.keys(ATTENDANCE_STATUS_CONFIG) as AttendanceStatus[];

export default function AttendanceStatusDropdown({
  value,
  onChange,
  disabled = false,
  compact = false,
  onlyOffDay = false,
  restrictedStatuses = [],
  align = 'center',
  placement = 'bottom',
  employeeGender,
  wfhRestrictionReason,
}: AttendanceStatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Collapse the accordion automatically when the dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
    }
  }, [isOpen]);

  const toggleDropdown = () => {
    if (disabled) return;
    if (!isOpen && triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect());
    }
    if (isOpen) {
      setIsExpanded(false);
    }
    setIsOpen(!isOpen);
  };

  // Dynamically update coordinates if window is resized while open
  useEffect(() => {
    if (!isOpen) return;
    const updateRect = () => {
      if (triggerRef.current) {
        setTriggerRect(triggerRef.current.getBoundingClientRect());
      }
    };
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, { capture: true });
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, { capture: true });
    };
  }, [isOpen]);

  const primaryKeys: AttendanceStatus[] = ['PRESENT', 'LATE', 'PAID_SICK_LEAVE', 'WFH', 'SCHEDULE_OFF', 'LWP'];

  const visibleStatuses = statuses.filter((status) => {
    if (onlyOffDay && status !== 'SCHEDULE_OFF' && status !== 'PLANNED_LEAVE' && status !== 'RESTRICTED_HOLIDAY') {
      return false;
    }
    if (status === 'REMOTE_COMFORT_DAY' && employeeGender && employeeGender !== 'female') {
      return false;
    }
    return true;
  });

  const coreList = visibleStatuses.filter((status) => primaryKeys.includes(status));
  const otherList = visibleStatuses.filter((status) => !primaryKeys.includes(status));

  const activeConfig = value ? ATTENDANCE_STATUS_CONFIG[value] : null;

  const dropdownMenu = isOpen && triggerRect && mounted && typeof document !== 'undefined' ? (
    createPortal(
      <>
        {/* Global Backdrop for clicking outside */}
        <div
          className="fixed inset-0 z-[9998] cursor-default bg-transparent"
          onClick={() => setIsOpen(false)}
        />

        {/* Popover Options Menu */}
        <div
          style={{
            position: 'absolute',
            zIndex: 9999,
            // Calculate screen coordinates adjusted for global page scroll offsets (using 480px height guard)
            top: triggerRect.bottom + window.scrollY + 6 + 480 > document.documentElement.scrollHeight
              ? triggerRect.top + window.scrollY - 6
              : triggerRect.bottom + window.scrollY + 6,
            transform: triggerRect.bottom + window.scrollY + 6 + 480 > document.documentElement.scrollHeight
              ? 'translateY(-100%)'
              : 'translateY(0)',
            left: triggerRect.left + window.scrollX + 192 > window.innerWidth + window.scrollX
              ? triggerRect.right + window.scrollX - 192
              : triggerRect.left + window.scrollX,
          }}
          onMouseLeave={() => setIsExpanded(false)}
          className="bg-white border border-slate-200/90 rounded-2xl p-1.5 shadow-2xl ring-1 ring-black/5 w-48 max-h-[460px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent animate-in fade-in duration-150"
        >
          <div className="px-2 py-1 text-[9px] font-black text-slate-400 tracking-wider uppercase border-b border-slate-100 mb-1 select-none">
            Choose Status
          </div>
          <div className="space-y-0.5">
            {value && (
              <div className="mb-1 pb-1 border-b border-slate-100/80">
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between text-left px-2 py-1.5 text-xs font-semibold rounded-xl transition duration-150 cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <span>Unmark</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black shadow-sm bg-slate-100 text-slate-500 border border-slate-200/40">
                    CLEAR
                  </span>
                </button>
              </div>
            )}
            {(() => {
              const renderStatusButton = (status: AttendanceStatus) => {
                const itemConfig = ATTENDANCE_STATUS_CONFIG[status];
                const isSelected = value === status;
                const isRestricted = restrictedStatuses.includes(status);

                if (isRestricted) {
                  let restrictionTitle = "Restricted option";
                  if (status === 'WFH') {
                    restrictionTitle = wfhRestrictionReason || "WFH privilege restricted";
                  } else if (status === 'PAID_SICK_LEAVE') {
                    restrictionTitle = "Paid Sick Leave restricted: 0 PSL balance remaining";
                  } else if (status === 'REMOTE_COMFORT_DAY') {
                    if (employeeGender && employeeGender !== 'female') {
                      restrictionTitle = "Remote Comfort Day restricted: only allowed for female employees";
                    } else {
                      restrictionTitle = "Remote Comfort Day restricted: 1 RCD limit reached for the month";
                    }
                  } else if (status === 'EARLY_LEAVE') {
                    restrictionTitle = "Early Leave restricted: 1 Early Leave limit reached for the month";
                  }

                  return (
                    <button
                      key={status}
                      type="button"
                      disabled
                      className="w-full flex items-center justify-between text-left px-2 py-1.5 text-xs font-semibold rounded-xl opacity-45 cursor-not-allowed text-slate-400 bg-slate-50/50"
                      title={restrictionTitle}
                    >
                      <span className="flex items-center gap-1">
                        <span>{itemConfig.label}</span>
                        <svg className="w-3 h-3 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-400 shadow-none border border-slate-200/40">
                        {itemConfig.code}
                      </span>
                    </button>
                  );
                }

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      onChange(status);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between text-left px-2 py-1.5 text-xs font-semibold rounded-xl transition duration-150 cursor-pointer ${isSelected
                        ? 'bg-indigo-50/50 text-indigo-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <span>{itemConfig.label}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black shadow-sm ${itemConfig.color}`}>
                      {itemConfig.code}
                    </span>
                  </button>
                );
              };

              return (
                <div className="space-y-1.5">
                  {/* Core Statuses */}
                  <div className="space-y-0.5">
                    {coreList.map(renderStatusButton)}
                  </div>

                  {/* Expandable Accordion for Other Options */}
                  {otherList.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsExpanded(!isExpanded);
                        }}
                        onMouseEnter={() => setIsExpanded(true)}
                        className="w-full flex items-center justify-between px-2 py-1.5 mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/40 rounded-xl transition-all duration-150 cursor-pointer border-t border-slate-100/80 select-none"
                      >
                        <span>{isExpanded ? 'Less Options' : 'More Options'}</span>
                        <svg
                          className={`w-3 h-3 transform transition-transform duration-200 text-slate-400 group-hover:text-indigo-600 ${isExpanded ? 'rotate-180' : ''
                            }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isExpanded && (
                        <div className="space-y-0.5 pt-1 animate-in slide-in-from-top-1 duration-150">
                          {otherList.map(renderStatusButton)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </>,
      document.body
    )
  ) : null;

  return (
    <div ref={triggerRef} className="relative inline-block text-left">
      {/* Trigger Button */}
      {activeConfig ? (
        <button
          type="button"
          onClick={toggleDropdown}
          disabled={disabled}
          className={`group/btn inline-flex items-center justify-center gap-1.5 rounded-xl border font-bold shadow-sm transition-all hover:scale-[1.03] hover:shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${activeConfig.color} ${compact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3.5 py-2.5 text-xs'
            }`}
          title={activeConfig.label}
        >
          <span>{activeConfig.code}</span>
          <svg className="w-2.5 h-2.5 opacity-60 group-hover/btn:translate-y-0.5 transition-transform shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleDropdown}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl text-[10px] font-bold text-slate-500 hover:text-indigo-600 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        >
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span>Mark</span>
        </button>
      )}

      {/* Render Portal Dropdown menu inside body */}
      {dropdownMenu}
    </div>
  );
}
