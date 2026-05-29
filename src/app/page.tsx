import { redirect } from 'next/navigation';
import { getAuthUser, getRoleDashboard } from '@/lib/auth';

export default async function Home() {
  const user = await getAuthUser();

  if (user) {
    redirect(getRoleDashboard(user.role));
  } else {
    redirect('/login');
  }
}
