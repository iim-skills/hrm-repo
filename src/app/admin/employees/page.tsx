'use client';

import { useState, useEffect, useCallback } from 'react';
import DataTable, { getEmployeeColumns } from '@/components/DataTable';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import EmployeeForm from '@/components/EmployeeForm';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import type { IEmployee, PaginationInfo, EmployeeFormData } from '@/types';

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<IEmployee[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [departments, setDepartments] = useState<string[]>([]);
  const [managers, setManagers] = useState<{ _id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<IEmployee | null>(null);

  const fetchEmployees = useCallback(async (page = 1) => {
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
      if (!res.ok) throw new Error('Failed to fetch employees');

      const data = await res.json();
      setEmployees(data.employees);
      setPagination(data.pagination);
      setDepartments(data.departments);
    } catch {
      setError('Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [search, department]);

  const fetchManagers = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=1000');
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
    fetchEmployees();
    fetchManagers();
  }, [fetchEmployees, fetchManagers]);

  const handleCreate = async (data: EmployeeFormData) => {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create employee');
    }

    setShowForm(false);
    fetchEmployees();
    fetchManagers();
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
      throw new Error(err.error || 'Failed to update employee');
    }

    setEditingEmployee(null);
    setShowForm(false);
    fetchEmployees();
    fetchManagers();
  };

  const handleDelete = async (employee: IEmployee) => {
    if (!confirm(`Are you sure you want to deactivate ${employee.name}?`)) return;

    try {
      const res = await fetch(`/api/employees/${employee._id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to deactivate');
      fetchEmployees();
    } catch {
      alert('Failed to deactivate employee');
    }
  };

  const handleEdit = (employee: IEmployee) => {
    setEditingEmployee(employee);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingEmployee(null);
  };

  const columns = getEmployeeColumns('/hr/employees');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employees</h1>
          <p className="text-sm text-slate-500 mt-1">Full employee management — Admin access</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Employee
        </button>
      </div>

      <div className="mb-5">
        <SearchFilter
          search={search}
          onSearchChange={(v) => { setSearch(v); }}
          department={department}
          onDepartmentChange={(v) => { setDepartment(v); }}
          departments={departments}
        />
      </div>

      {loading ? (
        <LoadingState message="Loading employees..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchEmployees()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={employees}
            onEdit={handleEdit}
            onDelete={handleDelete}
            showActions
          />
          <Pagination pagination={pagination} onPageChange={fetchEmployees} />
        </>
      )}

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
