import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, Lock, LogOut, ShieldCheck, UsersRound } from 'lucide-react';
import { apiJson } from '../lib/api';

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-md ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [error, setError] = useState('');

  const requestAdmin = useCallback(async (path) => {
    return apiJson(path, { admin: true });
  }, []);

  const logout = () => {
    localStorage.removeItem('adminToken');
    navigate('/auth');
  };

  const exportCsv = () => {
    const rows = [
      ['type', 'name', 'score', 'createdAt'],
      ...(admin?.recentScans || []).map((scan) => ['scan', scan.name, scan.score?.score || '', scan.createdAt || '']),
      ...(admin?.users || []).map((user) => ['user', user.username, user.profileCompleted ? 'complete' : 'incomplete', user.createdAt || '']),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nutriveda-admin.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const loadAdmin = async () => {
      try {
        const data = await requestAdmin('/api/admin/summary');
        setAdmin(data);
      } catch (loadError) {
        localStorage.removeItem('adminToken');
        setError(loadError.message || 'Admin session expired.');
      }
    };

    loadAdmin();
  }, [requestAdmin]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white/95 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-600 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Admin Portal</p>
              <h1 className="text-xl font-bold text-slate-950">Nutriveda Control Panel</h1>
            </div>
          </div>
          <nav className="flex flex-wrap gap-3">
            <Link to="/guide" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-700">
              Guide
            </Link>
            <button type="button" onClick={exportCsv} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">
              Export CSV
            </button>
            <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <section className="rounded-lg bg-gradient-to-r from-emerald-700 via-teal-700 to-sky-700 p-6 text-white shadow-sm">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-100">Secure admin login successful</p>
            <h2 className="mt-2 text-3xl font-bold">Project analytics and platform summary</h2>
            <p className="mt-3 text-sm leading-6 text-emerald-50">
              This area is separate from the student/user nutrition flow and opens only when the admin username and password are used on the login page.
            </p>
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <section className="mt-6 grid gap-5 md:grid-cols-4">
          <StatCard icon={UsersRound} label="Total Users" value={admin?.totalUsers || 0} tone="bg-emerald-100 text-emerald-700" />
          <StatCard icon={BarChart3} label="Food Scans" value={admin?.totalScans || 0} tone="bg-sky-100 text-sky-700" />
          <StatCard icon={Activity} label="Active Users" value={admin?.activeUsers || 0} tone="bg-violet-100 text-violet-700" />
          <StatCard icon={ShieldCheck} label="Average Score" value={admin?.averageHealthScore || 0} tone="bg-amber-100 text-amber-700" />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Most Scanned Foods</h3>
            <div className="mt-5 space-y-3">
              {(admin?.mostScannedFoods || []).length === 0 && (
                <p className="text-sm text-slate-500">No scanned foods yet.</p>
              )}
              {(admin?.mostScannedFoods || []).map((food, index) => (
                <div key={food.name} className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{index + 1}. {food.name}</p>
                    <p className="text-xs text-slate-500">Logged by users in recent scans</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">{food.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-900 text-white">
              <Lock className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-950">Admin Separation</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Normal users cannot reach this page from the dashboard. Admin access is verified with the backend credentials stored in server/.env.
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Recent Users</h3>
            <div className="mt-4 space-y-3">
              {(admin?.users || []).map((user) => (
                <div key={user.id} className="rounded-md bg-slate-50 p-3">
                  <p className="font-bold text-slate-900">{user.username}</p>
                  <p className="text-xs text-slate-500">{user.profileCompleted ? 'Profile complete' : 'Profile incomplete'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Recent Scans</h3>
            <div className="mt-4 space-y-3">
              {(admin?.recentScans || []).map((scan) => (
                <div key={scan.id} className="flex items-center justify-between rounded-md bg-slate-50 p-3">
                  <div>
                    <p className="font-bold text-slate-900">{scan.name}</p>
                    <p className="text-xs text-slate-500">{scan.mealCategory}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">{scan.score?.score || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
