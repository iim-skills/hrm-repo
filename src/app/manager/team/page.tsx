'use client';

import { useState, useEffect, useCallback } from 'react';
import DataTable, { getEmployeeColumns } from '@/components/DataTable';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import EmployeeForm from '@/components/EmployeeForm';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import type { IEmployee, PaginationInfo, EmployeeFormData } from '@/types';

export default function ManagerTeamPage() {
  const [employees, setEmployees] = useState<IEmployee[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [departments, setDepartments] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<IEmployee | null>(null);
  const [managers, setManagers] = useState<{ _id: string; name: string }[]>([]);

  const fetchTeam = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        ...(search && { search }),
        ...(department && { department }),
      });

      const res = await fetch(`/api/employees?${params}`);
      if (!res.ok) throw new Error('Failed to fetch team');

      const data = await res.json();
      setEmployees(data.employees);
      setPagination(data.pagination);
      setDepartments(data.departments);
    } catch {
      setError('Failed to load team members');
    } finally {
      setLoading(false);
    }
  }, [search, department]);

  const fetchManagers = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=1000&managersOnly=true');
      if (!res.ok) return;
      const data = await res.json();
      const mgrs = data.employees
        .filter((e: any) => e.role === 'manager' || e.role === 'hr' || e.role === 'admin')
        .map((e: any) => ({ _id: e.userId || e._id, name: e.name }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setManagers(mgrs);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    fetchTeam();
    fetchManagers();
  }, [fetchTeam, fetchManagers]);

  const handleCreate = async (data: EmployeeFormData) => {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add team member');
    }

    setShowForm(false);
    fetchTeam();
  };

  const handleUpdate = async (data: EmployeeFormData) => {
    if (!editingEmployee) return;

    const res = await fetch(`/api/employees/${editingEmployee._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update team member');
    }

    setEditingEmployee(null);
    setShowForm(false);
    fetchTeam();
  };

  const handleEdit = (employee: IEmployee) => {
    setEditingEmployee(employee);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingEmployee(null);
  };

  const columns = getEmployeeColumns('/manager/team');

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Team</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your team members</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Team Member
        </button>
      </div>

      <div className="mb-5">
        <SearchFilter
          search={search}
          onSearchChange={setSearch}
          department={department}
          onDepartmentChange={setDepartment}
          departments={departments}
        />
      </div>

      {loading ? (
        <LoadingState message="Loading team..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchTeam()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={employees}
            onEdit={handleEdit}
            showActions
          />
          <Pagination pagination={pagination} onPageChange={fetchTeam} />
        </>
      )}

      {/* Add/Edit Employee Form Modal */}
      {showForm && (
        <EmployeeForm
          employee={editingEmployee}
          managers={managers}
          onSubmit={editingEmployee ? handleUpdate : handleCreate}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}
