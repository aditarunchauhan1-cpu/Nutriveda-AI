import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

function listToText(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function parseList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [caloricTarget, setCaloricTarget] = useState('');
  const [proteinTarget, setProteinTarget] = useState('');
  const [dietaryPreferences, setDietaryPreferences] = useState('');
  const [healthConditions, setHealthConditions] = useState('');
  const [allergies, setAllergies] = useState('');
  const [goal, setGoal] = useState('maintenance');
  const [dietType, setDietType] = useState('balanced');
  const [gender, setGender] = useState('not specified');
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [error, setError] = useState('');
  const [existingUserId, setExistingUserId] = useState(localStorage.getItem('userId') || '');

  const suggestedTargets = useMemo(() => {
    const weightNumber = Number(weight);
    const heightNumber = Number(height);
    const ageNumber = Number(age);
    if (!weightNumber || !heightNumber || !ageNumber) return null;

    const genderOffset = gender === 'female' ? -161 : 5;
    const bmr = Math.round((10 * weightNumber) + (6.25 * heightNumber) - (5 * ageNumber) + genderOffset);
    const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
    const maintenance = Math.round(bmr * (multipliers[activityLevel] || 1.55));
    const calories = goal.includes('loss') ? maintenance - 400 : goal.includes('muscle') ? maintenance + 250 : maintenance;
    const protein = Math.round(weightNumber * (goal.includes('muscle') ? 1.8 : 1.4));
    return { bmr, maintenance, calories: Math.max(1200, calories), protein };
  }, [activityLevel, age, gender, goal, height, weight]);

  const applySuggestedTargets = () => {
    if (!suggestedTargets) return;
    setCaloricTarget(String(suggestedTargets.calories));
    setProteinTarget(String(suggestedTargets.protein));
  };

  useEffect(() => {
    if (!existingUserId) {
      navigate('/auth');
      return undefined;
    }

    const loadProfile = async () => {
      setIsLoadingProfile(true);
      setError('');

      try {
        const response = await apiFetch(`/api/users/${existingUserId}`);

        if (!response.ok) {
          localStorage.removeItem('userId');
          setExistingUserId('');
          return;
        }

        const data = await response.json();
        const user = data.user;

        setAge(String(user.age ?? ''));
        setHeight(String(user.height ?? ''));
        setWeight(String(user.weight ?? ''));
        setCaloricTarget(String(user.caloric_target ?? ''));
        setProteinTarget(String(user.protein_target ?? ''));
        setDietaryPreferences(listToText(user.dietary_preferences));
        setHealthConditions(listToText(user.complications));
        setAllergies(listToText(user.allergies));
        setGoal(user.goal || 'maintenance');
        setDietType(user.diet_type || 'balanced');
        setGender(user.gender || 'not specified');
        setActivityLevel(user.activity_level || 'moderate');
      } catch {
        setError('Could not load your saved profile. You can still submit a new one.');
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadProfile();
    return undefined;
  }, [existingUserId, navigate]);

  const logout = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('authToken');
    localStorage.removeItem('adminToken');
    setExistingUserId('');
    navigate('/auth');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const formData = {
      age: Number(age),
      height: Number(height),
      weight: Number(weight),
      caloric_target: Number(caloricTarget),
      protein_target: Number(proteinTarget),
      dietary_preferences: parseList(dietaryPreferences),
      complications: parseList(healthConditions),
      allergies: parseList(allergies),
      goal,
      diet_type: dietType,
      gender,
      activity_level: activityLevel,
    };

    try {
      if (!existingUserId) {
        navigate('/auth');
        return;
      }

      const response = await apiFetch(`/api/users/${existingUserId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      const userId = result.userId || result.user?.id || existingUserId;

      if (userId) {
        localStorage.setItem('userId', userId);
      }

      navigate('/main');
    } catch (submitError) {
      setError(submitError.message || 'Could not save your profile.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white/95 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Nutriveda</p>
            <h1 className="text-xl font-bold text-slate-950">User Profile Setup</h1>
          </div>
          <nav className="flex flex-wrap gap-3">
            <Link to="/guide" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-700">
              Guide
            </Link>
            {existingUserId && (
              <Link to="/main" className="rounded-md bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">
                Dashboard
              </Link>
            )}
            <button type="button" onClick={logout} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,560px)_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Step 2 of 3</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Complete Your Profile</h2>
                <p className="text-sm text-slate-500 mt-1">
                  This information powers BMI, BMR, calorie targets, allergy checks and food scoring.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {isLoadingProfile && (
              <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading profile...
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="age" className="block text-sm font-medium text-slate-700">Age</label>
                <input min="5" max="120" type="number" id="age" value={age} onChange={(e) => setAge(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" required />
              </div>
              <div>
                <label htmlFor="height" className="block text-sm font-medium text-slate-700">Height (cm)</label>
                <input min="50" max="260" type="number" id="height" value={height} onChange={(e) => setHeight(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" required />
              </div>
              <div>
                <label htmlFor="weight" className="block text-sm font-medium text-slate-700">Weight (kg)</label>
                <input min="15" max="400" type="number" id="weight" value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" required />
              </div>
              <div>
                <label htmlFor="caloricTarget" className="block text-sm font-medium text-slate-700">Caloric Target</label>
                <input min="800" max="8000" type="number" id="caloricTarget" value={caloricTarget} onChange={(e) => setCaloricTarget(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" required />
              </div>
              <div>
                <label htmlFor="proteinTarget" className="block text-sm font-medium text-slate-700">Protein Target (g)</label>
                <input min="10" max="500" type="number" id="proteinTarget" value={proteinTarget} onChange={(e) => setProteinTarget(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" required />
              </div>
              {suggestedTargets && (
                <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
                  Suggested from BMI/BMR: {suggestedTargets.calories} calories and {suggestedTargets.protein}g protein.
                  <button type="button" onClick={applySuggestedTargets} className="ml-2 font-bold text-emerald-700 underline">
                    Use targets
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="goal" className="block text-sm font-medium text-slate-700">Goal</label>
                  <select id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500">
                    <option value="weight loss">Weight loss</option>
                    <option value="muscle gain">Muscle gain</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="diabetic-friendly">Diabetic-friendly</option>
                    <option value="heart-friendly">Heart-friendly</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="dietType" className="block text-sm font-medium text-slate-700">Diet Type</label>
                  <select id="dietType" value={dietType} onChange={(e) => setDietType(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500">
                    <option value="balanced">Balanced</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="vegan">Vegan</option>
                    <option value="high protein">High protein</option>
                    <option value="low carb">Low carb</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="gender" className="block text-sm font-medium text-slate-700">Gender</label>
                  <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500">
                    <option value="not specified">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="activityLevel" className="block text-sm font-medium text-slate-700">Activity</label>
                  <select id="activityLevel" value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500">
                    <option value="sedentary">Sedentary</option>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="active">Active</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="dietaryPreferences" className="block text-sm font-medium text-slate-700">Dietary Preferences</label>
                <input type="text" id="dietaryPreferences" placeholder="vegetarian, low sugar" value={dietaryPreferences} onChange={(e) => setDietaryPreferences(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" />
              </div>
              <div>
                <label htmlFor="healthConditions" className="block text-sm font-medium text-slate-700">Health Conditions</label>
                <input type="text" id="healthConditions" placeholder="diabetes, hypertension" value={healthConditions} onChange={(e) => setHealthConditions(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" />
              </div>
              <div>
                <label htmlFor="allergies" className="block text-sm font-medium text-slate-700">Allergies</label>
                <input type="text" id="allergies" placeholder="peanuts, milk, gluten" value={allergies} onChange={(e) => setAllergies(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500" />
              </div>
              <button
                type="submit"
                className="flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-slate-400"
                disabled={isLoading || isLoadingProfile}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Profile and Continue'
                )}
              </button>
            </form>
        </section>

        <section className="flex flex-col justify-center rounded-lg bg-gradient-to-br from-sky-700 via-teal-700 to-emerald-700 p-8 text-white shadow-sm">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-100">Personal nutrition setup</p>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">
              Nutriveda
            </h2>
            <p className="mt-4 text-sm leading-6 text-emerald-50">
              Your personal AI nutritionist that analyzes eating habits, suggests balanced meal plans, and provides real-time guidance for healthier lifestyle choices.
            </p>
            <div className="mt-6 grid gap-3 text-sm">
              <div className="rounded-md border border-white/15 bg-white/10 p-3">1. Login or create your user account.</div>
              <div className="rounded-md border border-white/15 bg-white/10 p-3">2. Complete this health and nutrition profile.</div>
              <div className="rounded-md border border-white/15 bg-white/10 p-3">3. Open the dashboard to analyze meals and track progress.</div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full text-center text-gray-500 p-4">
        <p>&copy; {new Date().getFullYear()} Nutriveda. All rights reserved.</p>
      </footer>
    </div>
  );
}
