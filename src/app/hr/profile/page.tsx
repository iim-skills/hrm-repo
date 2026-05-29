'use client';

import { useAuth } from '@/context/AuthContext';
import EmployeeProfileView from '@/components/EmployeeProfileView';
import LoadingState from '@/components/LoadingState';

export default function HRProfilePage() {
  const { user } = useAuth();

  if (!user?.employeeId) {
    return <LoadingState message="Resolving profile details..." />;
  }

  return <EmployeeProfileView employeeId={user.employeeId} isSelfProfile={true} />;
}
