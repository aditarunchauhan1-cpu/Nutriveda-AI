import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LockKeyhole, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { API_BASE_URL, readError } from '../lib/api';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        const adminCredentials = btoa(`${username.trim()}:${password}`);
        const adminResponse = await fetch(`${API_BASE_URL}/api/admin/login`, {
          method: 'POST',
          headers: { Authorization: `Basic ${adminCredentials}` },
        });

        if (adminResponse.ok) {
          const adminData = await adminResponse.json();
          localStorage.removeItem('userId');
          localStorage.removeItem('username');
          localStorage.removeItem('authToken');
          localStorage.setItem('adminToken', adminData.token);
          navigate('/admin');
          return;
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      localStorage.removeItem('adminToken');
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('username', data.username);
      localStorage.setItem('authToken', data.token);
      navigate('/');
    } catch (authError) {
      setError(authError.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="grid md:grid-cols-[1fr_440px]">
          <div className="bg-gradient-to-br from-emerald-700 via-teal-700 to-sky-800 p-8 text-white md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-50">
              <Sparkles className="h-3.5 w-3.5" />
              Nutriveda Project
            </div>
            <h1 className="mt-5 text-4xl font-bold">Nutriveda</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-emerald-50">
              One login page, two clear paths: users enter Nutriveda, admins enter the protected control panel.
            </p>
            <div className="mt-8 grid gap-3 text-sm">
              <div className="flex items-start gap-3 rounded-md border border-white/15 bg-white/10 p-4">
                <UserRound className="mt-0.5 h-5 w-5 text-emerald-100" />
                <div>
                  <p className="font-bold">User flow</p>
                  <p className="mt-1 text-emerald-50">Login or signup, complete profile, then analyze meals.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border border-white/15 bg-white/10 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-sky-100" />
                <div>
                  <p className="font-bold">Admin flow</p>
                  <p className="mt-1 text-emerald-50">Use admin credentials here to open the admin dashboard.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Secure access</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Login or Create Account</h2>
                <p className="mt-1 text-sm text-slate-500">Admin credentials open the admin portal automatically.</p>
              </div>
              <Link to="/guide" className="text-sm font-semibold text-teal-700 hover:text-teal-900">Guide</Link>
            </div>

            <div className="mb-5 grid grid-cols-2 rounded-md bg-slate-100 p-1">
              <button type="button" onClick={() => setMode('login')} className={`rounded px-3 py-2 text-sm font-bold ${mode === 'login' ? 'bg-white text-emerald-700 shadow' : 'text-slate-600'}`}>Login</button>
              <button type="button" onClick={() => setMode('signup')} className={`rounded px-3 py-2 text-sm font-bold ${mode === 'signup' ? 'bg-white text-emerald-700 shadow' : 'text-slate-600'}`}>Signup</button>
            </div>

            {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700">Username</label>
                <input id="username" className="mt-1 w-full rounded-md border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
                <input id="password" type="password" minLength="6" className="mt-1 w-full rounded-md border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 font-bold text-white shadow-sm hover:bg-emerald-700 disabled:bg-slate-400" disabled={loading}>
                <LockKeyhole className="h-4 w-4" />
                {loading ? 'Please wait...' : mode === 'login' ? 'Continue' : 'Create User Account'}
              </button>
            </form>
            <div className="mt-5 rounded-md bg-sky-50 p-4 text-sm text-sky-800">
              User signup creates a normal account only. Admin access uses the admin username and password from <span className="font-bold">server/.env</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
