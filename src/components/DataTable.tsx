import Link from 'next/link';
import Badge from './Badge';
import type { IEmployee } from '@/types';

interface Column {
  key: string;
  label: string;
  render?: (employee: IEmployee) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: IEmployee[];
  onEdit?: (employee: IEmployee) => void;
  onDelete?: (employee: IEmployee) => void;
  showActions?: boolean;
}

export default function DataTable({ columns, data, onEdit, onDelete, showActions = false }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead>
          <tr className="bg-slate-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                {col.label}
              </th>
            ))}
            {showActions && (
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((employee) => (
            <tr key={employee._id} className="hover:bg-slate-50/50 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3.5 text-sm text-slate-700 whitespace-nowrap">
                  {col.render ? col.render(employee) : (employee as unknown as Record<string, unknown>)[col.key] as string}
                </td>
              ))}
              {showActions && (
                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(employee)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(employee)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Deactivate"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="py-12 text-center text-sm text-slate-400">
          No employees found
        </div>
      )}
    </div>
  );
}

// Default column configuration for employee tables
export function getEmployeeColumns(basePath?: string): Column[] {
  return [
    {
      key: 'name',
      label: 'Name',
      render: (emp) => {
        if (!basePath) {
          return <span className="font-medium text-slate-800">{emp.name}</span>;
        }
        return (
          <Link href={`${basePath}/${emp._id}`}>
            <span className="font-semibold text-slate-900 text-sm hover:text-indigo-600 hover:underline cursor-pointer transition">
              {emp.name}
            </span>
          </Link>
        );
      },
    },
    { key: 'email', label: 'Email' },
    { key: 'department', label: 'Department' },
    {
      key: 'role',
      label: 'Role',
      render: (emp) => <Badge variant={emp.role} label={emp.role.toUpperCase()} />,
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (emp) => (
        <Badge
          variant={emp.isActive ? 'active' : 'inactive'}
          label={emp.isActive ? 'Active' : 'Inactive'}
        />
      ),
    },
  ];
}
