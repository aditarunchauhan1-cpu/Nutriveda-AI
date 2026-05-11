import { Link } from 'react-router-dom';

export function Button({ as: Tag = 'button', tone = 'primary', className = '', children, ...props }) {
  const tones = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'bg-sky-600 text-white hover:bg-sky-700',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'border border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-700',
    dark: 'bg-slate-900 text-white hover:bg-slate-800',
  };

  return (
    <Tag className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold shadow-sm transition disabled:bg-slate-400 ${tones[tone]} ${className}`} {...props}>
      {children}
    </Tag>
  );
}

export function Panel({ title, children, action }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, subtext, bar, tone = 'emerald' }) {
  const colors = {
    emerald: 'bg-emerald-600',
    sky: 'bg-sky-600',
    amber: 'bg-amber-500',
    violet: 'bg-violet-600',
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      {subtext && <p className="mt-2 text-sm text-slate-500">{subtext}</p>}
      {typeof bar === 'number' && (
        <div className="mt-3 h-2 rounded-full bg-slate-100">
          <div className={`h-2 rounded-full ${colors[tone] || colors.emerald}`} style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} />
        </div>
      )}
    </div>
  );
}

export function InputField({ label, id, className = '', ...props }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
      <input id={id} className={`mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 ${className}`} {...props} />
    </label>
  );
}

export function SelectField({ label, id, className = '', children, ...props }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
      <select id={id} className={`mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 ${className}`} {...props}>
        {children}
      </select>
    </label>
  );
}

export function AppHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="border-b border-slate-200 bg-white/95 shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <nav className="flex flex-wrap gap-3">{actions}</nav>}
      </div>
    </header>
  );
}

export function EmptyState({ title, text, actionLabel, to }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
      <p className="font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
      {to && actionLabel && (
        <Link to={to} className="mt-3 inline-flex rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}
