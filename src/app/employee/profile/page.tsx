'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import Badge from '@/components/Badge';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import type { IEmployee } from '@/types';

export default function EmployeeProfilePage() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState<IEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.employeeId) {
      fetchProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.employeeId]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/employees/${user?.employeeId}`);
      if (!res.ok) throw new Error('Failed to fetch profile');
      const data = await res.json();
      setEmployee(data.employee);
    } catch {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading profile..." />;
  if (error) return <ErrorState message={error} onRetry={fetchProfile} />;
  if (!employee) return null;

  const profileFields = [
    { label: 'Full Name', value: employee.name },
    { label: 'Email', value: employee.email },
    { label: 'Department', value: employee.department },
    { label: 'Gender', value: employee.genderFlag, badge: employee.genderFlag },
    { label: 'Joining Date', value: new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) },
    { label: 'Current Tier', value: `Tier ${employee.currentRosterTier}`, badge: `tier${employee.currentRosterTier}` },
    { label: 'Role', value: employee.role.toUpperCase(), badge: employee.role },
    { label: 'Status', value: employee.isActive ? 'Active' : 'Inactive', badge: employee.isActive ? 'active' : 'inactive' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">My Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Your personal information</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Profile Header */}
        <div className="bg-linear-to-r from-indigo-600 to-purple-600 px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-bold text-white backdrop-blur-sm">
              {employee.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{employee.name}</h2>
              <p className="text-indigo-200 text-sm">{employee.department}</p>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
            {profileFields.map((field) => (
              <div key={field.label}>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{field.label}</p>
                {field.badge ? (
                  <Badge variant={field.badge} label={field.value} />
                ) : (
                  <p className="text-sm font-medium text-slate-800">{field.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
