'use client';

import React from 'react';
import EmployeeProfileView from '@/components/EmployeeProfileView';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ManagerProfilePage({ params }: PageProps) {
  const { id } = React.use(params);
  return <EmployeeProfileView employeeId={id} />;
}
