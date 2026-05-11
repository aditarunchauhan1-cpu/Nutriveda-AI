import { Link } from 'react-router-dom';
import { BarChart3, Camera, ClipboardList, FileText, HeartPulse, UserRound } from 'lucide-react';

const steps = [
  {
    title: 'Login or Signup',
    icon: UserRound,
    text: 'Start at /auth with a username and password. Dashboard pages stay locked until an account exists.',
  },
  {
    title: 'Create Profile',
    icon: ClipboardList,
    text: 'Enter age, height, weight, calorie target, protein target, goal, diet type, allergies, and health conditions.',
  },
  {
    title: 'Analyze Food',
    icon: Camera,
    text: 'Upload a food image or use manual entry when the image model is slow or unavailable.',
  },
  {
    title: 'Review Score',
    icon: HeartPulse,
    text: 'Check the nutrition score, warnings, AI explanation, and healthier alternatives.',
  },
  {
    title: 'Track History',
    icon: BarChart3,
    text: 'Search, filter, favorite, delete, and compare previous meals from your food history.',
  },
  {
    title: 'Use Reports',
    icon: HeartPulse,
    text: 'Open the dashboard charts to show weekly calories, protein, scan count, and healthy ratio.',
  },
  {
    title: 'Export',
    icon: FileText,
    text: 'Use the PDF button on the dashboard to print or save a report for project demonstration.',
  },
];

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 rounded-lg bg-gradient-to-r from-emerald-700 via-teal-700 to-sky-700 p-6 text-white shadow-sm md:flex md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-100">Project flow</p>
            <h1 className="mt-1 text-3xl font-bold">Nutriveda Project Guide</h1>
            <p className="mt-2 text-emerald-50">A clean demo flow with separate user and admin access.</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 md:mt-0">
            <Link to="/" className="rounded-md bg-white px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50">
              Profile
            </Link>
            <Link to="/auth" className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20">
              Login
            </Link>
            <Link to="/main" className="rounded-md bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">
              Dashboard
            </Link>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;

            return (
              <div key={step.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-emerald-600 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">{step.title}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{step.text}</p>
              </div>
            );
          })}
        </section>

        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Recommended Demo Script</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-gray-700">
            <li>Open /auth and create or login to a sample account.</li>
            <li>Complete the profile with a clear goal, such as muscle gain or diabetic-friendly.</li>
            <li>Go to the dashboard and show the calorie/protein cards before adding food.</li>
            <li>Add one manual food first so the demo is fast and reliable.</li>
            <li>Upload one food image to demonstrate AI image analysis with Ollama.</li>
            <li>Show nutrition score, health warnings, alternatives, and AI recommendation.</li>
            <li>Open history filters, mark a favorite, select two foods, and compare them.</li>
            <li>Generate the meal planner and show weekly charts.</li>
            <li>For admin demo, return to /auth and login with the admin credentials from server/.env to open /admin.</li>
            <li>Click PDF to save or print the dashboard as a report.</li>
          </ol>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Major Project Modules</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-700">
              <li>User profiling and personalization</li>
              <li>AI food image analysis</li>
              <li>Nutrition estimation and scoring</li>
              <li>Health/allergy warning engine</li>
              <li>Food history and analytics</li>
              <li>AI meal planning</li>
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Fallback Demo Path</h2>
            <p className="mt-4 text-sm leading-6 text-gray-700">
              If image analysis takes too long during presentation, use manual food entry. It still demonstrates MongoDB storage,
              scoring, warnings, recommendations, charts, history, comparison, favorites, and reporting.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
