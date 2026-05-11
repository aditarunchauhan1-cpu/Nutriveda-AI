import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Heart,
  Loader2,
  Printer,
  RefreshCw,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API_BASE_URL, apiFetch, apiJson, apiJsonBody, getUserToken, readError } from '../lib/api';
import { EmptyState, SkeletonBlock } from '../components/ui';

const scoreColors = {
  Good: 'bg-green-100 text-green-700 border-green-200',
  Moderate: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Avoid: 'bg-red-100 text-red-700 border-red-200',
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 300000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      ...(options.headers || {}),
    };
    const token = getUserToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    return await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function NutritionList({ foodAnalysis }) {
  return (
    <ul className="grid grid-cols-2 gap-2 text-sm">
      <li><span className="font-semibold">Calories:</span> {foodAnalysis?.Calories || 'NA'}</li>
      <li><span className="font-semibold">Protein:</span> {foodAnalysis?.Protein || 'NA'}</li>
      <li><span className="font-semibold">Fat:</span> {foodAnalysis?.['Total Fat'] || 'NA'}</li>
      <li><span className="font-semibold">Carbs:</span> {foodAnalysis?.Carbohydrates || 'NA'}</li>
      <li><span className="font-semibold">Sodium:</span> {foodAnalysis?.Sodium || 'NA'}</li>
      <li><span className="font-semibold">Cholesterol:</span> {foodAnalysis?.Cholesterol || 'NA'}</li>
    </ul>
  );
}

function ScoreBadge({ score }) {
  const label = score?.label || 'Moderate';
  const className = scoreColors[label] || scoreColors.Moderate;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>
      {label} {typeof score?.score === 'number' ? `${score.score}/100` : ''}
    </span>
  );
}

export default function Mainpage() {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [report, setReport] = useState(null);
  const [tips, setTips] = useState([]);
  const [mealPlan, setMealPlan] = useState(null);
  const [manualFood, setManualFood] = useState({
    name: '',
    calories: '',
    protein: '',
    totalFat: '',
    carbohydrates: '',
    sodium: '',
    cholesterol: '',
    mealCategory: 'lunch',
    logDate: new Date().toISOString().slice(0, 10),
  });
  const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [barcode, setBarcode] = useState('890100000001');
  const [barcodeFood, setBarcodeFood] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [toast, setToast] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSummary, setEmailSummary] = useState('');
  const [compareSelection, setCompareSelection] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const userId = localStorage.getItem('userId');

  const loadProjectData = useCallback(async () => {
    if (!userId) return;

    setPageLoading(true);

    try {
      const [historyData, dashboardData, reportData, tipsData] = await Promise.all([
        apiJson(`/api/users/${userId}/foods?limit=20`),
        apiJson(`/api/users/${userId}/dashboard`),
        apiJson(`/api/users/${userId}/report`),
        apiJson(`/api/users/${userId}/tips`),
      ]);

      if (dashboardData.user?.profileCompleted === false) {
        navigate('/');
        return;
      }

      setHistory(historyData.foods || []);
      setDashboard(dashboardData);
      setReport(reportData);
      setTips(tipsData.tips || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load dashboard data.');
    } finally {
      setPageLoading(false);
    }
  }, [navigate, userId]);

  useEffect(() => {
    if (!userId) {
      navigate('/auth');
      return;
    }

    loadProjectData();
  }, [loadProjectData, navigate, userId]);

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const query = search.trim().toLowerCase();

    return history.filter((item) => {
      const name = `${item.name || ''} ${item.foodAnalysis?.['Food Item'] || ''}`.toLowerCase();
      const createdAt = item.createdAt ? new Date(item.createdAt).getTime() : now;
      const daysOld = (now - createdAt) / (1000 * 60 * 60 * 24);
      const dateMatch = dateFilter === 'all'
        || (dateFilter === 'today' && daysOld < 1)
        || (dateFilter === 'week' && daysOld <= 7);
      const scoreMatch = scoreFilter === 'all' || item.score?.label === scoreFilter;

      return (!query || name.includes(query)) && dateMatch && scoreMatch;
    });
  }, [dateFilter, history, scoreFilter, search]);

  const scorePieData = useMemo(() => {
    if (!report?.scoreCounts) return [];

    return Object.entries(report.scoreCounts).map(([name, value]) => ({ name, value }));
  }, [report]);

  const optimizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const MAX_WIDTH = 768;
      const MAX_HEIGHT = 768;
      const QUALITY = 0.82;

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onerror = () => reject(new Error('Could not read image.'));
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onerror = () => reject(new Error('Could not load image.'));

        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            const aspectRatio = width / height;
            if (width > height) {
              width = MAX_WIDTH;
              height = Math.round(width / aspectRatio);
            } else {
              height = MAX_HEIGHT;
              width = Math.round(height * aspectRatio);
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d', {
            colorSpace: 'srgb',
            willReadFrequently: true,
          });

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Could not optimize image.'));
                return;
              }

              resolve(new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              }));
            },
            'image/jpeg',
            QUALITY,
          );
        };
      };
    });
  };

  const handleImageChange = async (event) => {
    if (!event.target.files?.[0]) return;

    setError('');

    try {
      const optimizedImage = await optimizeImage(event.target.files[0]);
      const nextPreviewUrl = URL.createObjectURL(optimizedImage);

      setSelectedImage(optimizedImage);
      setPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return nextPreviewUrl;
      });
    } catch (imageError) {
      setError(imageError.message || 'Error processing image. Please try another image.');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedImage) {
      setError('Please select an image first.');
      return;
    }

    setLoading(true);
    setError('');
    setAnalysisResult(null);
    setStatusText('Preparing image...');

    const formData = new FormData();
    formData.append('image', selectedImage);
    formData.append('userId', userId);

    const statusTimers = [
      setTimeout(() => setStatusText('Identifying food...'), 1500),
      setTimeout(() => setStatusText('Estimating nutrition...'), 12000),
      setTimeout(() => setStatusText('Scoring health fit...'), 24000),
      setTimeout(() => setStatusText('Generating alternatives...'), 32000),
    ];

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/analyze-food`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(await readError(response));

      const data = await response.json();
      setAnalysisResult(data);
      setStatusText('Analysis complete.');
      await loadProjectData();
    } catch (submitError) {
      setError(submitError.name === 'AbortError'
        ? 'Analysis timed out. Try a smaller image or check Ollama.'
        : submitError.message || 'An error occurred while analyzing the image.');
      setStatusText('');
    } finally {
      statusTimers.forEach(clearTimeout);
      setLoading(false);
    }
  };

  const submitManualFood = async (event) => {
    event.preventDefault();
    setManualLoading(true);
    setError('');

    try {
      const data = await apiJsonBody(`/api/users/${userId}/manual-food`, manualFood);
      setAnalysisResult(data);
      setManualFood({
        name: '',
        calories: '',
        protein: '',
        totalFat: '',
        carbohydrates: '',
        sodium: '',
        cholesterol: '',
        mealCategory: 'lunch',
        logDate: new Date().toISOString().slice(0, 10),
      });
      setToast('Food saved successfully.');
      await loadProjectData();
    } catch (manualError) {
      setError(manualError.message || 'Could not save manual food.');
    } finally {
      setManualLoading(false);
    }
  };

  const deleteFood = async (foodItemId) => {
    setError('');

    try {
      await apiFetch(`/api/foods/${foodItemId}`, {
        method: 'DELETE',
      });

      setHistory((items) => items.filter((item) => item.id !== foodItemId));
      setAnalysisResult((current) => current?.foodItemId === foodItemId ? null : current);
      setDeleteCandidate(null);
      setToast('Food deleted.');
      await loadProjectData();
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete food item.');
    }
  };

  const toggleFavorite = async (item) => {
    try {
      await apiJsonBody(`/api/foods/${item.id}/favorite`, { favorite: !item.favorite }, { method: 'PATCH' });
      setToast(!item.favorite ? 'Added to favorites.' : 'Removed from favorites.');
      await loadProjectData();
    } catch (favoriteError) {
      setError(favoriteError.message || 'Could not update favorite.');
    }
  };

  const generateMealPlan = async () => {
    setPlannerLoading(true);
    setError('');

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/users/${userId}/meal-plan`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error(await readError(response));

      const data = await response.json();
      setMealPlan(data.plan);
      setToast('Meal plan generated.');
    } catch (plannerError) {
      setError(plannerError.message || 'Could not generate meal plan.');
    } finally {
      setPlannerLoading(false);
    }
  };

  const toggleCompareSelection = (foodId) => {
    setComparison(null);
    setCompareSelection((current) => {
      if (current.includes(foodId)) return current.filter((id) => id !== foodId);
      return [...current, foodId].slice(-2);
    });
  };

  const compareFoods = async () => {
    if (compareSelection.length !== 2) {
      setError('Select exactly two foods from history to compare.');
      return;
    }

    try {
      const data = await apiJsonBody(`/api/users/${userId}/compare-foods`, {
        firstFoodId: compareSelection[0],
        secondFoodId: compareSelection[1],
      });
      setComparison(data);
      setToast('Comparison ready.');
    } catch (compareError) {
      setError(compareError.message || 'Could not compare foods.');
    }
  };

  const searchFoodDatabase = async () => {
    try {
      const data = await apiJson(`/api/foods/search?q=${encodeURIComponent(foodSearchQuery)}`);
      setFoodSearchResults(data.foods || []);
      if ((data.foods || []).length === 0) setToast('No foods found.');
    } catch (searchError) {
      setError(searchError.message || 'Could not search foods.');
    }
  };

  const findBarcode = async () => {
    try {
      const data = await apiJson(`/api/barcode/${barcode}`);
      setBarcodeFood(data.food);
      setToast('Barcode food found.');
    } catch (barcodeError) {
      setError(barcodeError.message || 'Barcode not found.');
    }
  };

  const logDatabaseFood = async (food) => {
    const payload = {
      ...food,
      mealCategory: manualFood.mealCategory,
      logDate: manualFood.logDate,
    };
    const data = await apiJsonBody(`/api/users/${userId}/manual-food`, payload);
    setAnalysisResult(data);
    setToast(`${food.name} logged.`);
    await loadProjectData();
  };

  const sendWeeklyEmail = async () => {
    try {
      const data = await apiJsonBody(`/api/users/${userId}/weekly-email`, { email: emailAddress });
      setEmailSummary(data.summary);
      setToast(data.sent ? 'Weekly email sent.' : 'Weekly summary generated.');
    } catch (emailError) {
      setError(emailError.message || 'Could not generate weekly email.');
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const calorieProgress = dashboard?.targets?.calories
    ? Math.min(100, Math.round((dashboard.totals.calories / dashboard.targets.calories) * 100))
    : 0;
  const proteinProgress = dashboard?.targets?.protein
    ? Math.min(100, Math.round((dashboard.totals.protein / dashboard.targets.protein) * 100))
    : 0;
  const logout = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('authToken');
    localStorage.removeItem('adminToken');
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white/95 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Step 3 of 3</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">Nutrition Dashboard</h2>
            <p className="text-sm text-slate-500 mt-1">Analyze meals, review warnings, and track your daily nutrition.</p>
          </div>
          <nav className="flex flex-wrap gap-3">
            <Link to="/guide" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-700">
              How to Use
            </Link>
            <Link to="/" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-700">
              Edit Profile
            </Link>
            <button type="button" onClick={logout} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">
              Logout
            </button>
            <button
              type="button"
              onClick={loadProjectData}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              disabled={pageLoading}
            >
              <RefreshCw className={`h-4 w-4 ${pageLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700"
            >
              <Printer className="h-4 w-4" />
              PDF
            </button>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {toast && (
          <button
            type="button"
            onClick={() => setToast('')}
            className="fixed right-4 top-4 z-50 rounded-md bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg"
          >
            {toast}
          </button>
        )}

        {error && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mb-8 rounded-lg bg-gradient-to-r from-emerald-700 via-teal-700 to-sky-700 p-6 text-white shadow-sm">
          <h3 className="text-xl font-bold">User Nutrition Workspace</h3>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-md border border-white/15 bg-white/10 p-3">1. Add food by image or manual entry.</div>
            <div className="rounded-md border border-white/15 bg-white/10 p-3">2. Check score, warnings and alternatives.</div>
            <div className="rounded-md border border-white/15 bg-white/10 p-3">3. Use filters, favorites and comparison.</div>
            <div className="rounded-md border border-white/15 bg-white/10 p-3">4. Generate meal plan and export report.</div>
          </div>
        </section>

        {pageLoading && !dashboard ? (
          <section className="grid gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-32" />)}
          </section>
        ) : (
        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg bg-white p-4 shadow">
            <p className="text-sm font-medium text-gray-500">Calories Today</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{Math.round(dashboard?.totals?.calories || 0)} / {dashboard?.targets?.calories || 0}</p>
            <div className="mt-3 h-2 rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${calorieProgress}%` }} />
            </div>
          </div>
          <div className="rounded-lg bg-white p-4 shadow">
            <p className="text-sm font-medium text-gray-500">Protein Today</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{Math.round(dashboard?.totals?.protein || 0)}g / {dashboard?.targets?.protein || 0}g</p>
            <div className="mt-3 h-2 rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-green-600" style={{ width: `${proteinProgress}%` }} />
            </div>
          </div>
          <div className="rounded-lg bg-white p-4 shadow">
            <p className="text-sm font-medium text-gray-500">Weekly Scans</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{report?.totalScans || 0}</p>
            <p className="mt-2 text-sm text-gray-500">Avg {report?.averageCalories || 0} calories</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow">
            <p className="text-sm font-medium text-gray-500">Most Common</p>
            <p className="mt-2 text-lg font-bold text-gray-900">{report?.topFood || 'No scans yet'}</p>
            <p className="mt-2 text-sm text-gray-500">Avg {report?.averageProtein || 0}g protein</p>
          </div>
        </section>
        )}

        <section className="mt-8 grid gap-8 lg:grid-cols-2">
          <div className="rounded-lg bg-white p-4 shadow">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-gray-700" />
              <h3 className="font-bold text-gray-900">Weekly Calories and Protein</h3>
            </div>
            <div className="h-72">
              {(report?.daily || []).length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report?.daily || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="calories" fill="#0f766e" />
                    <Bar dataKey="protein" fill="#0284c7" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No chart data yet" text="Log a meal to populate weekly calories and protein." />
              )}
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <div className="mb-4 flex items-center gap-2">
              <Heart className="h-5 w-5 text-gray-700" />
              <h3 className="font-bold text-gray-900">Healthy Ratio</h3>
            </div>
            <div className="h-72">
              {scorePieData.some((item) => item.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={scorePieData} dataKey="value" nameKey="name" outerRadius={90} label>
                      {scorePieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.name === 'Good' ? '#16a34a' : entry.name === 'Moderate' ? '#ca8a04' : '#dc2626'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No score data yet" text="Nutrition scores appear after you log foods." />
              )}
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_430px]">
          <main className="space-y-8">
            <section className="rounded-lg bg-white p-6 shadow">
              <h3 className="text-lg font-bold text-gray-900">Image Food Analysis</h3>
              <form onSubmit={handleSubmit} className="mt-5 space-y-5">
                <label htmlFor="dropzone-file" className="flex h-80 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-gray-50 transition hover:bg-gray-100 relative overflow-hidden">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="absolute inset-0 h-full w-full object-contain p-4" />
                  ) : (
                    <div className="text-center">
                      <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                      <p className="text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                      <p className="mt-1 text-xs text-gray-500">Image is compressed before analysis for speed</p>
                    </div>
                  )}
                  <input id="dropzone-file" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>

                <button type="submit" className="w-full rounded-lg bg-black px-4 py-3 font-bold text-white transition hover:bg-gray-800 disabled:bg-gray-400" disabled={!selectedImage || loading}>
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                      {statusText || 'Analyzing...'}
                    </span>
                  ) : 'Analyze Image'}
                </button>
              </form>
            </section>

            <section className="rounded-lg bg-white p-6 shadow">
              <h3 className="text-lg font-bold text-gray-900">Manual Food Entry</h3>
              <form onSubmit={submitManualFood} className="mt-5 grid gap-4 md:grid-cols-4">
                <input className="rounded-md border-gray-300 md:col-span-2" placeholder="Food name" value={manualFood.name} onChange={(e) => setManualFood({ ...manualFood, name: e.target.value })} required />
                <select className="rounded-md border-gray-300" value={manualFood.mealCategory} onChange={(e) => setManualFood({ ...manualFood, mealCategory: e.target.value })}>
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
                <input className="rounded-md border-gray-300" type="date" value={manualFood.logDate} onChange={(e) => setManualFood({ ...manualFood, logDate: e.target.value })} />
                <input className="rounded-md border-gray-300" placeholder="Calories" type="number" value={manualFood.calories} onChange={(e) => setManualFood({ ...manualFood, calories: e.target.value })} required />
                <input className="rounded-md border-gray-300" placeholder="Protein g" type="number" value={manualFood.protein} onChange={(e) => setManualFood({ ...manualFood, protein: e.target.value })} required />
                <input className="rounded-md border-gray-300" placeholder="Fat g" type="number" value={manualFood.totalFat} onChange={(e) => setManualFood({ ...manualFood, totalFat: e.target.value })} />
                <input className="rounded-md border-gray-300" placeholder="Carbs g" type="number" value={manualFood.carbohydrates} onChange={(e) => setManualFood({ ...manualFood, carbohydrates: e.target.value })} />
                <input className="rounded-md border-gray-300" placeholder="Sodium mg" type="number" value={manualFood.sodium} onChange={(e) => setManualFood({ ...manualFood, sodium: e.target.value })} />
                <input className="rounded-md border-gray-300" placeholder="Cholesterol mg" type="number" value={manualFood.cholesterol} onChange={(e) => setManualFood({ ...manualFood, cholesterol: e.target.value })} />
                <button className="rounded-md bg-black px-4 py-2 text-sm font-bold text-white disabled:bg-gray-400 md:col-span-4" disabled={manualLoading}>
                  {manualLoading ? 'Saving...' : 'Save Manual Food'}
                </button>
              </form>
            </section>

            <section className="rounded-lg bg-white p-6 shadow">
              <h3 className="text-lg font-bold text-gray-900">Food Search and Barcode</h3>
              <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto]">
                <input className="rounded-md border-gray-300" placeholder="Search paneer, dal, dosa..." value={foodSearchQuery} onChange={(e) => setFoodSearchQuery(e.target.value)} />
                <button type="button" onClick={searchFoodDatabase} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Search</button>
                <input className="rounded-md border-gray-300" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                <button type="button" onClick={findBarcode} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-bold text-white">Barcode</button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {foodSearchResults.map((food) => (
                  <button key={food.barcode} type="button" onClick={() => logDatabaseFood(food)} className="rounded-md bg-slate-50 p-3 text-left text-sm hover:bg-emerald-50">
                    <b>{food.name}</b> - {food.calories} cal, {food.protein}g protein
                  </button>
                ))}
                {barcodeFood && (
                  <button type="button" onClick={() => logDatabaseFood(barcodeFood)} className="rounded-md bg-sky-50 p-3 text-left text-sm text-sky-900">
                    {barcodeFood.name} found. Click to log.
                  </button>
                )}
              </div>
            </section>

            {analysisResult && !analysisResult.error && (
              <section className="grid gap-8 md:grid-cols-2">
                <div className="rounded-lg bg-white shadow">
                  <div className="border-b bg-gray-50 px-4 py-3">
                    <h3 className="text-lg font-bold text-gray-900">Latest Analysis</h3>
                  </div>
                  <div className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="font-semibold">{analysisResult.foodAnalysis?.['Food Item'] || 'Analyzed food'}</h4>
                      <ScoreBadge score={analysisResult.score || analysisResult.recommendation?.score} />
                    </div>
                    {analysisResult.foodDescription && (
                      <p className="mb-4 text-sm text-gray-600">{analysisResult.foodDescription}</p>
                    )}
                    <NutritionList foodAnalysis={analysisResult.foodAnalysis} />
                    {(analysisResult.warnings || analysisResult.recommendation?.warnings || []).length > 0 && (
                      <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                        {(analysisResult.warnings || analysisResult.recommendation?.warnings || []).map((warning) => <p key={warning}>{warning}</p>)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-white shadow">
                  <div className="border-b bg-gray-50 px-4 py-3">
                    <h3 className="text-lg font-bold text-gray-900">Recommendation</h3>
                  </div>
                  <div className="p-4">
                    <p className="whitespace-pre-line text-sm text-gray-700">{analysisResult.recommendation?.recommendation || 'Recommendation unavailable.'}</p>
                    <div className="mt-4">
                      <h4 className="text-sm font-bold text-gray-900">Better Alternatives</h4>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                        {(analysisResult.alternatives || analysisResult.recommendation?.alternatives || []).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-lg bg-white p-6 shadow">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-bold text-gray-900">Food History</h3>
                <div className="flex flex-wrap gap-3">
                  <input className="rounded-md border-gray-300 text-sm" placeholder="Search food" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select className="rounded-md border-gray-300 text-sm" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                    <option value="all">All dates</option>
                    <option value="today">Today</option>
                    <option value="week">Last 7 days</option>
                  </select>
                  <select className="rounded-md border-gray-300 text-sm" value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)}>
                    <option value="all">All scores</option>
                    <option value="Good">Good</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Avoid">Avoid</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {filteredHistory.length === 0 && <EmptyState title="Log your first meal" text="Use image analysis, manual entry, food search, or barcode lookup to start your history." />}
                {filteredHistory.map((item) => (
                  <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h4 className="font-semibold text-gray-900">{item.name || item.foodAnalysis?.['Food Item'] || 'Food item'}</h4>
                          <ScoreBadge score={item.score} />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => toggleCompareSelection(item.id)} className={`rounded-md px-3 py-2 text-xs font-bold ${compareSelection.includes(item.id) ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}>
                          Compare
                        </button>
                        <button type="button" onClick={() => toggleFavorite(item)} className="rounded-md p-2 text-gray-500 hover:bg-yellow-50 hover:text-yellow-600" aria-label="Favorite food">
                          <Star className={`h-4 w-4 ${item.favorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                        </button>
                        <button type="button" onClick={() => setDeleteCandidate(item)} className="rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Delete food item">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-4">
                      <NutritionList foodAnalysis={item.foodAnalysis} />
                    </div>
                    {item.recommendation?.recommendation && <p className="mt-3 text-sm text-gray-600">{item.recommendation.recommendation}</p>}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={compareFoods} className="rounded-md bg-black px-4 py-2 text-sm font-bold text-white disabled:bg-gray-400" disabled={compareSelection.length !== 2}>
                  Compare Selected Foods
                </button>
                {comparison && <p className="text-sm font-semibold text-green-700">{comparison.winner?.name} is better. {comparison.reason}</p>}
              </div>
            </section>
          </main>

          <aside className="space-y-8">
            <section className="rounded-lg bg-white p-5 shadow">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-gray-900">Daily Meal Planner</h3>
                <button type="button" onClick={generateMealPlan} className="rounded-md bg-black px-3 py-2 text-sm font-bold text-white disabled:bg-gray-400" disabled={plannerLoading}>
                  {plannerLoading ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {mealPlan ? (
                <div className="mt-4 space-y-3">
                  {Object.entries(mealPlan).map(([slot, meal]) => (
                    <div key={slot} className="rounded-md bg-gray-50 p-3">
                      <p className="text-xs font-bold uppercase text-gray-500">{slot}</p>
                      <p className="font-semibold text-gray-900">{meal.name}</p>
                      <p className="text-sm text-gray-600">{meal.calories} cal, {meal.protein}g protein</p>
                      <p className="mt-1 text-sm text-gray-600">{meal.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Generate your first meal plan" text="Create a one-day plan based on your goal, preferences, allergies, and health conditions." />
              )}
            </section>

            <section className="rounded-lg bg-white p-5 shadow">
              <h3 className="text-lg font-bold text-gray-900">Health Tips</h3>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-700">
                {tips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </section>

            <section className="rounded-lg bg-white p-5 shadow">
              <h3 className="text-lg font-bold text-gray-900">Favorites</h3>
              <div className="mt-4 space-y-3">
                {history.filter((item) => item.favorite).length === 0 && <p className="text-sm text-gray-500">No favorites yet.</p>}
                {history.filter((item) => item.favorite).slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-md bg-gray-50 p-3">
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-600">{item.foodAnalysis?.Calories || 'NA'} calories</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg bg-white p-5 shadow">
              <h3 className="text-lg font-bold text-gray-900">Weekly Email</h3>
              <p className="mt-2 text-sm text-gray-500">Send with SMTP when configured, otherwise generate a local summary.</p>
              <input className="mt-4 w-full rounded-md border-gray-300" placeholder="recipient@example.com" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} />
              <button type="button" onClick={sendWeeklyEmail} className="mt-3 w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
                Generate / Send
              </button>
              {emailSummary && <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">{emailSummary}</p>}
            </section>
          </aside>
        </div>
      </div>
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-950">Delete food item?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This will remove {deleteCandidate.name || 'this food'} from your history and reports.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteCandidate(null)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">
                Cancel
              </button>
              <button type="button" onClick={() => deleteFood(deleteCandidate.id)} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-bold text-white">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
