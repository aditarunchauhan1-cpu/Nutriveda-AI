import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { Ollama } from 'ollama';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import nodemailer from 'nodemailer';

dotenv.config({ path: new URL('./.env', import.meta.url) });

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'nutrition_ai';
const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'mistral';
const chatModel = process.env.OLLAMA_CHAT_MODEL || 'mistral';
const visionModel = process.env.OLLAMA_VISION_MODEL || 'llava:7b';
const requestTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 240000);
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
const authSecret = process.env.AUTH_SECRET || crypto.createHash('sha256').update(`${mongoUri}:${adminPassword || 'nutriveda'}`).digest('hex');
const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || smtpUser;

if (!mongoUri) {
  throw new Error('Missing MONGODB_URI in server/.env');
}

const mongoClient = new MongoClient(mongoUri);
await mongoClient.connect();

const db = mongoClient.db(dbName);
const usersCollection = db.collection('users');
const foodItemsCollection = db.collection('food_items');
const weightLogsCollection = db.collection('weight_logs');

await Promise.all([
  usersCollection.createIndex({ createdAt: -1 }),
  usersCollection.createIndex({ username: 1 }, { unique: true, sparse: true }),
  foodItemsCollection.createIndex({ userId: 1, createdAt: -1 }),
  weightLogsCollection.createIndex({ userId: 1, date: 1 }),
]);

const foodDatabase = JSON.parse(readFileSync(new URL('./data/foods.json', import.meta.url), 'utf8'));

const requestCounts = new Map();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 6 * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});

const ollama = new Ollama();

function isDevelopment() {
  return process.env.NODE_ENV !== 'production';
}

function errorPayload(message, error) {
  return isDevelopment() && error?.message
    ? { error: message, details: error.message }
    : { error: message };
}

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateUserPayload(body) {
  const userInfo = {
    age: parseNumber(body.age),
    height: parseNumber(body.height),
    weight: parseNumber(body.weight),
    caloric_target: parseNumber(body.caloric_target),
    protein_target: parseNumber(body.protein_target),
    dietary_preferences: splitList(body.dietary_preferences),
    complications: splitList(body.complications),
    allergies: splitList(body.allergies),
    goal: typeof body.goal === 'string' && body.goal.trim() ? body.goal.trim() : 'maintenance',
    diet_type: typeof body.diet_type === 'string' && body.diet_type.trim() ? body.diet_type.trim() : 'balanced',
    gender: typeof body.gender === 'string' && body.gender.trim() ? body.gender.trim() : 'not specified',
    activity_level: typeof body.activity_level === 'string' && body.activity_level.trim() ? body.activity_level.trim() : 'moderate',
  };

  const errors = [];

  if (!userInfo.age || userInfo.age < 5 || userInfo.age > 120) errors.push('Age must be between 5 and 120.');
  if (!userInfo.height || userInfo.height < 50 || userInfo.height > 260) errors.push('Height must be between 50 and 260 cm.');
  if (!userInfo.weight || userInfo.weight < 15 || userInfo.weight > 400) errors.push('Weight must be between 15 and 400 kg.');
  if (!userInfo.caloric_target || userInfo.caloric_target < 800 || userInfo.caloric_target > 8000) errors.push('Caloric target must be between 800 and 8000.');
  if (!userInfo.protein_target || userInfo.protein_target < 10 || userInfo.protein_target > 500) errors.push('Protein target must be between 10 and 500 g.');

  return { userInfo, errors };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword || !storedPassword.includes(':')) return false;
  const [salt, storedHash] = storedPassword.split(':');
  const attemptedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(attemptedHash, 'hex'));
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signToken(payload, expiresInSeconds = 60 * 60 * 8) {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const encodedBody = base64UrlEncode(body);
  const signature = crypto
    .createHmac('sha256', authSecret)
    .update(`${header}.${encodedBody}`)
    .digest('base64url');

  return `${header}.${encodedBody}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', authSecret)
    .update(`${header}.${body}`)
    .digest('base64url');

  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getBearerPayload(req) {
  const authHeader = String(req.headers.authorization || '');
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer') return null;
  return verifyToken(token);
}

function requireUser(req, res, next) {
  const payload = getBearerPayload(req);
  if (!payload || payload.role !== 'user' || !toObjectId(payload.sub)) {
    return res.status(401).json({ error: 'User authentication is required.' });
  }

  req.userId = payload.sub;
  req.userObjectId = toObjectId(payload.sub);
  next();
}

function requireSameUser(req, res, next) {
  if (req.params.userId !== req.userId) {
    return res.status(403).json({ error: 'You can only access your own data.' });
  }

  next();
}

function rateLimit({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}:${req.headers.authorization || ''}:${req.body?.username || ''}`;
    const now = Date.now();
    const current = requestCounts.get(key) || { count: 0, resetAt: now + windowMs };

    if (current.resetAt <= now) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }

    current.count += 1;
    requestCounts.set(key, current);

    if (current.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
    }

    next();
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdmin(req, res, next) {
  if (!adminUsername || !adminPassword) {
    return res.status(503).json({ error: 'Admin credentials are not configured on the server.' });
  }

  const authHeader = String(req.headers.authorization || '');
  const [scheme, encoded] = authHeader.split(' ');

  if (scheme === 'Bearer') {
    const payload = verifyToken(encoded);
    if (payload?.role === 'admin') {
      req.adminUsername = payload.sub;
      return next();
    }
  }

  if (scheme !== 'Basic' || !encoded) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nutriveda Admin"');
    return res.status(401).json({ error: 'Admin username and password are required.' });
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';

  if (!safeEqual(username, adminUsername) || !safeEqual(password, adminPassword)) {
    return res.status(401).json({ error: 'Invalid admin username or password.' });
  }

  next();
}

function parseEmbedding(embeddingData) {
  if (Array.isArray(embeddingData)) {
    return Array.isArray(embeddingData[0]) ? embeddingData[0] : embeddingData;
  }

  if (typeof embeddingData === 'string') {
    try {
      return JSON.parse(embeddingData);
    } catch (error) {
      console.error('Error parsing embedding string:', error.message);
    }
  }

  if (typeof embeddingData === 'object' && embeddingData && Object.prototype.hasOwnProperty.call(embeddingData, 'vector')) {
    return embeddingData.vector;
  }

  return null;
}

function cosineSimilarity(embedding1, embedding2) {
  const vec1 = parseEmbedding(embedding1);
  const vec2 = parseEmbedding(embedding2);

  if (!vec1 || !vec2 || !Array.isArray(vec1) || !Array.isArray(vec2)) {
    console.error('Invalid embedding format after parsing');
    return 0;
  }

  if (vec1.length !== vec2.length) {
    console.error(`Embedding length mismatch: ${vec1.length} vs ${vec2.length}`);
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    const v1 = Number(vec1[i]);
    const v2 = Number(vec2[i]);

    if (Number.isNaN(v1) || Number.isNaN(v2)) continue;

    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  return Number.isNaN(similarity) ? 0 : similarity;
}

function withTimeout(promise, label, timeoutMs = requestTimeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function getEmbedding(data, label) {
  const inputText = JSON.stringify(data);
  console.log(`Generating ${label} embedding with ${embeddingModel}`);

  const response = await withTimeout(
    ollama.embed({
      model: embeddingModel,
      input: inputText,
    }),
    `${label} embedding`,
  );

  const embedding = parseEmbedding(response.embeddings);

  if (!embedding) {
    throw new Error(`Invalid ${label} embedding format received from Ollama`);
  }

  console.log(`${label} embedding generated (${embedding.length} dimensions)`);
  return embedding;
}

function extractNumericValue(range) {
  if (!range) return '0';

  const matches = String(range).match(/\d+/g);
  if (!matches?.length) return '0';

  return matches.length > 1
    ? ((parseInt(matches[0], 10) + parseInt(matches[1], 10)) / 2).toFixed(0)
    : matches[0];
}

function numericNutritionValue(value) {
  return Number(extractNumericValue(value));
}

function nutritionValue(value, unit = '') {
  return {
    value: numericNutritionValue(value),
    unit,
    display: value === undefined || value === null || value === '' ? `0${unit}` : String(value),
  };
}

function normalizeNutrition(foodAnalysis) {
  return {
    calories: nutritionValue(foodAnalysis?.Calories, 'kcal'),
    totalFat: nutritionValue(foodAnalysis?.['Total Fat'], 'g'),
    cholesterol: nutritionValue(foodAnalysis?.Cholesterol, 'mg'),
    sodium: nutritionValue(foodAnalysis?.Sodium, 'mg'),
    carbohydrates: nutritionValue(foodAnalysis?.Carbohydrates, 'g'),
    protein: nutritionValue(foodAnalysis?.Protein, 'g'),
  };
}

function nutritionDisplay(nutrition, key) {
  const item = nutrition?.[key];
  if (item && typeof item === 'object') return item.display ?? `${item.value || 0}${item.unit || ''}`;
  return item;
}

function foodAnalysisFromNutrition(name, nutrition) {
  return {
    'Food Item': name || 'Food item',
    Calories: nutritionDisplay(nutrition, 'calories'),
    'Total Fat': nutritionDisplay(nutrition, 'totalFat'),
    Cholesterol: nutritionDisplay(nutrition, 'cholesterol'),
    Sodium: nutritionDisplay(nutrition, 'sodium'),
    Carbohydrates: nutritionDisplay(nutrition, 'carbohydrates'),
    Protein: nutritionDisplay(nutrition, 'protein'),
  };
}

function getNutritionInfo(foodItem) {
  if (foodItem.nutrition) {
    return {
      calories: foodItem.nutrition.calories?.value,
      totalFat: foodItem.nutrition.totalFat?.value,
      cholesterol: foodItem.nutrition.cholesterol?.value,
      sodium: foodItem.nutrition.sodium?.value,
      carbohydrates: foodItem.nutrition.carbohydrates?.value,
      protein: foodItem.nutrition.protein?.value,
    };
  }

  if (foodItem.foodAnalysis) {
    return {
      calories: foodItem.foodAnalysis.Calories,
      totalFat: foodItem.foodAnalysis['Total Fat'],
      cholesterol: foodItem.foodAnalysis.Cholesterol,
      sodium: foodItem.foodAnalysis.Sodium,
      carbohydrates: foodItem.foodAnalysis.Carbohydrates,
      protein: foodItem.foodAnalysis.Protein,
    };
  }

  return Array.isArray(foodItem.nutrition_info)
    ? foodItem.nutrition_info[0]
    : foodItem.nutrition_info;
}

function buildHealthWarnings(user, nutritionInfo, foodName = '', ingredients = []) {
  const warnings = [];
  const complications = splitList(user.complications).map((item) => item.toLowerCase());
  const allergies = splitList(user.allergies).map((item) => item.toLowerCase());
  const lowerFoodText = `${foodName} ${ingredients.join(' ')}`.toLowerCase();
  const sodium = numericNutritionValue(nutritionInfo?.sodium);
  const carbohydrates = numericNutritionValue(nutritionInfo?.carbohydrates);
  const cholesterol = numericNutritionValue(nutritionInfo?.cholesterol);
  const totalFat = numericNutritionValue(nutritionInfo?.totalFat);

  if (complications.some((item) => item.includes('hypertension') || item.includes('blood pressure')) && sodium > 500) {
    warnings.push('High sodium may not be suitable for hypertension or blood pressure management.');
  }

  if (complications.some((item) => item.includes('diabetes') || item.includes('sugar')) && carbohydrates > 45) {
    warnings.push('High carbohydrates may need caution for diabetes or sugar control.');
  }

  if (complications.some((item) => item.includes('cholesterol') || item.includes('heart')) && (cholesterol > 80 || totalFat > 25)) {
    warnings.push('High fat or cholesterol may not fit a heart-friendly plan.');
  }

  allergies.forEach((allergy) => {
    if (allergy && lowerFoodText.includes(allergy)) {
      warnings.push(`This food may contain ${allergy}, which is listed in your allergies.`);
    }
  });

  return warnings;
}

function buildAlternatives(user, nutritionInfo) {
  const complications = splitList(user.complications).join(' ').toLowerCase();
  const goal = String(user.goal || '').toLowerCase();
  const alternatives = [
    'Grilled paneer or tofu bowl with vegetables',
    'Dal, salad, and brown rice portion bowl',
    'Sprout chaat with curd and cucumber',
  ];

  if (goal.includes('muscle')) {
    alternatives[0] = 'High-protein paneer/tofu tikka with salad';
  }

  if (goal.includes('loss') || numericNutritionValue(nutritionInfo?.calories) > 600) {
    alternatives[1] = 'Low-calorie vegetable soup with grilled protein';
  }

  if (complications.includes('diabetes')) {
    alternatives[2] = 'Low-GI moong dal chilla with mint curd';
  } else if (complications.includes('hypertension')) {
    alternatives[2] = 'Low-sodium vegetable khichdi with curd';
  }

  return alternatives;
}

function buildNutritionScore(user, nutritionInfo, foodName = '', ingredients = []) {
  let score = 100;
  const reasons = [];
  const calories = numericNutritionValue(nutritionInfo?.calories);
  const protein = numericNutritionValue(nutritionInfo?.protein);
  const sodium = numericNutritionValue(nutritionInfo?.sodium);
  const carbohydrates = numericNutritionValue(nutritionInfo?.carbohydrates);
  const totalFat = numericNutritionValue(nutritionInfo?.totalFat);
  const mealCalorieBudget = Math.max(250, Number(user.caloric_target || 2000) / 3);
  const mealProteinTarget = Math.max(10, Number(user.protein_target || 60) / 3);
  const warnings = buildHealthWarnings(user, nutritionInfo, foodName, ingredients);

  if (calories > mealCalorieBudget * 1.35) {
    score -= 18;
    reasons.push('Calories are high compared with your per-meal target.');
  }

  if (protein < mealProteinTarget * 0.55) {
    score -= 12;
    reasons.push('Protein is low for your goal.');
  }

  if (sodium > 700) {
    score -= 15;
    reasons.push('Sodium is on the higher side.');
  }

  if (totalFat > 30) {
    score -= 10;
    reasons.push('Fat content is high.');
  }

  if (carbohydrates > 65) {
    score -= 10;
    reasons.push('Carbohydrates are high.');
  }

  if (warnings.length) {
    score -= warnings.length * 12;
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const label = boundedScore >= 75 ? 'Good' : boundedScore >= 50 ? 'Moderate' : 'Avoid';

  return {
    score: boundedScore,
    label,
    reasons: reasons.length ? reasons : ['This food is reasonably aligned with your current profile.'],
    warnings,
    alternatives: buildAlternatives(user, nutritionInfo),
  };
}

function calculateBmiBmr(user) {
  const heightM = Number(user.height || 0) / 100;
  const bmi = heightM ? Number((Number(user.weight || 0) / (heightM * heightM)).toFixed(1)) : 0;
  const genderOffset = String(user.gender).toLowerCase() === 'female' ? -161 : 5;
  const bmr = Math.round((10 * Number(user.weight || 0)) + (6.25 * Number(user.height || 0)) - (5 * Number(user.age || 0)) + genderOffset);
  const activityMultipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  const maintenanceCalories = Math.round(bmr * (activityMultipliers[user.activity_level] || 1.55));
  const suggestedCalories = user.goal?.includes('loss')
    ? maintenanceCalories - 400
    : user.goal?.includes('muscle')
      ? maintenanceCalories + 250
      : maintenanceCalories;

  return { bmi, bmr, maintenanceCalories, suggestedCalories };
}

function calculateMacros(totals) {
  const proteinCalories = Math.round(Number(totals.protein || 0) * 4);
  const carbCalories = Math.round(Number(totals.carbohydrates || 0) * 4);
  const fatCalories = Math.round(Number(totals.fat || 0) * 9);
  const macroCalories = proteinCalories + carbCalories + fatCalories || 1;

  return {
    proteinPercent: Math.round((proteinCalories / macroCalories) * 100),
    carbPercent: Math.round((carbCalories / macroCalories) * 100),
    fatPercent: Math.round((fatCalories / macroCalories) * 100),
  };
}

function buildNutrientAlerts(user, totals) {
  const alerts = [];
  if (totals.calories > Number(user.caloric_target || 0)) alerts.push('Calories crossed your daily target.');
  if (totals.protein < Number(user.protein_target || 0) * 0.5) alerts.push('Protein is still low for today.');
  if (totals.carbohydrates > 250) alerts.push('Carbohydrates are high today.');
  if (totals.fat > 80) alerts.push('Fat intake is high today.');
  return alerts;
}

function estimateIngredients(text) {
  const knownIngredients = ['rice', 'paneer', 'tofu', 'chicken', 'dal', 'curd', 'potato', 'milk', 'peanut', 'wheat', 'egg', 'cheese', 'vegetables'];
  const lowerText = String(text || '').toLowerCase();
  return knownIngredients.filter((ingredient) => lowerText.includes(ingredient));
}

function withPortion(foodAnalysis, portion = 'medium', grams = null) {
  const portionMultipliers = { small: 0.75, medium: 1, large: 1.35, bowl: 1.15, plate: 1.4 };
  const multiplier = grams ? Number(grams) / 100 : (portionMultipliers[portion] || 1);
  const scaled = { ...foodAnalysis };
  ['Calories', 'Total Fat', 'Cholesterol', 'Sodium', 'Carbohydrates', 'Protein'].forEach((key) => {
    const value = numericNutritionValue(scaled[key]);
    if (value) scaled[key] = String(Math.round(value * multiplier));
  });
  return scaled;
}

function parseFoodPayload(body) {
  const foodAnalysis = {
    'Food Item': typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Manual food',
    Calories: String(body.calories ?? ''),
    'Total Fat': String(body.totalFat ?? body.fat ?? ''),
    Cholesterol: String(body.cholesterol ?? '0mg'),
    Sodium: String(body.sodium ?? '0mg'),
    Carbohydrates: String(body.carbohydrates ?? body.carbs ?? ''),
    Protein: String(body.protein ?? ''),
  };

  const errors = [];
  if (!foodAnalysis['Food Item']) errors.push('Food name is required.');
  if (!parseNumber(foodAnalysis.Calories)) errors.push('Calories are required.');
  if (!parseNumber(foodAnalysis.Protein)) errors.push('Protein is required.');

  return { foodAnalysis, errors };
}

function parseNutritionJson(text) {
  try {
    const jsonText = String(text || '').match(/\{[\s\S]*\}/)?.[0] || text;
    const parsed = JSON.parse(jsonText);
    const foodAnalysis = {
      'Food Item': String(parsed.foodItem || parsed.name || 'Unknown food'),
      Calories: String(parsed.calories ?? 0),
      'Total Fat': String(parsed.totalFat ?? parsed.fat ?? 0),
      Cholesterol: String(parsed.cholesterol ?? 0),
      Sodium: String(parsed.sodium ?? 0),
      Carbohydrates: String(parsed.carbohydrates ?? parsed.carbs ?? 0),
      Protein: String(parsed.protein ?? 0),
    };

    return foodAnalysis;
  } catch {
    return null;
  }
}

function defaultNutritionForDescription(description = 'Unknown food') {
  return {
    'Food Item': String(description).split(/[.,\n]/)[0].slice(0, 60) || 'Unknown food',
    Calories: '350',
    'Total Fat': '12',
    Cholesterol: '20',
    Sodium: '450',
    Carbohydrates: '45',
    Protein: '15',
  };
}

function normalizeMealPlan(plan) {
  const fallback = {
    breakfast: { name: 'Oats with curd and fruit', calories: 350, protein: 18, reason: 'Balanced start with fiber and protein.' },
    lunch: { name: 'Dal, brown rice, salad and curd', calories: 550, protein: 25, reason: 'Steady energy with familiar Indian foods.' },
    snack: { name: 'Sprout chaat', calories: 220, protein: 14, reason: 'High fiber, light and protein-rich.' },
    dinner: { name: 'Paneer/tofu tikka with vegetables', calories: 500, protein: 30, reason: 'Protein-focused dinner with fewer refined carbs.' },
  };

  return Object.fromEntries(
    Object.entries(fallback).map(([slot, defaultMeal]) => {
      const meal = plan?.[slot];

      if (!meal || typeof meal !== 'object') {
        return [slot, defaultMeal];
      }

      return [slot, {
        name: meal.name || defaultMeal.name,
        calories: meal.calories || defaultMeal.calories,
        protein: meal.protein || defaultMeal.protein,
        reason: meal.reason || defaultMeal.reason,
      }];
    }),
  );
}

async function buildRecommendation(user, foodItem) {
  const nutritionInfo = getNutritionInfo(foodItem);

  const userDietaryPreferences = splitList(user.dietary_preferences);
  const userComplications = splitList(user.complications);
  const similarityScore = cosineSimilarity(user.embedding, foodItem.embedding);
  const score = buildNutritionScore(user, nutritionInfo, foodItem.name);

  const contextPrompt = `Analyze if this food item is suitable based on this profile:

Profile:
- Age: ${user.age || 'Not specified'}
- Caloric Target: ${user.caloric_target || 'Not specified'} calories
- Protein Target: ${user.protein_target || 'Not specified'}g
- Goal: ${user.goal || 'maintenance'}
- Diet Type: ${user.diet_type || 'balanced'}
- Dietary Preferences: ${userDietaryPreferences.length ? userDietaryPreferences.join(', ') : 'None specified'}
- Health Complications: ${userComplications.length ? userComplications.join(', ') : 'None specified'}
- Allergies: ${splitList(user.allergies).length ? splitList(user.allergies).join(', ') : 'None specified'}

Food Item (${foodItem.name || 'Unknown'}):
- Calories: ${extractNumericValue(nutritionInfo?.calories)} calories
- Protein: ${extractNumericValue(nutritionInfo?.protein)}g
- Total Fat: ${extractNumericValue(nutritionInfo?.totalFat)}g
- Carbohydrates: ${extractNumericValue(nutritionInfo?.carbohydrates)}g
- Sodium: ${extractNumericValue(nutritionInfo?.sodium)}mg
- Cholesterol: ${extractNumericValue(nutritionInfo?.cholesterol)}mg

Embedding Similarity Score: ${(similarityScore * 100).toFixed(2)}%

Give one concise paragraph using "your" instead of "user". Include the alignment percentage, key concerns, and 2-3 better alternatives if needed.`;

  const mistralResponse = await withTimeout(
    ollama.generate({
      model: chatModel,
      prompt: contextPrompt,
      options: {
        num_predict: 180,
        temperature: 0.2,
      },
    }),
    'recommendation generation',
  );

  return {
    userId: user._id.toString(),
    foodItemId: foodItem._id.toString(),
    foodName: foodItem.name,
    similarityScore,
    recommendation: mistralResponse.response,
    nutritionInfo,
    score,
    warnings: score.warnings,
    alternatives: score.alternatives,
  };
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user._id.toString(),
    username: user.username,
    profileCompleted: user.profileCompleted === false
      ? false
      : Boolean(user.age && user.height && user.weight && user.caloric_target && user.protein_target),
    age: user.age,
    height: user.height,
    weight: user.weight,
    caloric_target: user.caloric_target,
    protein_target: user.protein_target,
    dietary_preferences: user.dietary_preferences || [],
    complications: user.complications || [],
    allergies: user.allergies || [],
    goal: user.goal || 'maintenance',
    diet_type: user.diet_type || 'balanced',
    gender: user.gender || 'not specified',
    activity_level: user.activity_level || 'moderate',
    metrics: calculateBmiBmr(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function publicFoodItem(item) {
  const nutrition = item.nutrition || normalizeNutrition(item.foodAnalysis || foodAnalysisFromNutrition(item.name, getNutritionInfo(item)));

  return {
    id: item._id.toString(),
    name: item.name,
    mealCategory: item.mealCategory || 'meal',
    logDate: item.logDate || item.createdAt,
    nutrition,
    nutrition_info: item.nutrition_info,
    foodAnalysis: item.foodAnalysis || foodAnalysisFromNutrition(item.name, nutrition),
    foodDescription: item.foodDescription,
    recommendation: item.recommendation,
    score: item.score,
    warnings: item.warnings || [],
    alternatives: item.alternatives || [],
    ingredients: item.ingredients || [],
    favorite: Boolean(item.favorite),
    createdAt: item.createdAt,
  };
}

app.get('/api/health', async (req, res) => {
  const health = {
    ok: true,
    mongo: 'unknown',
    ollama: 'unknown',
    models: {
      embedding: embeddingModel,
      chat: chatModel,
      vision: visionModel,
    },
  };

  try {
    await db.command({ ping: 1 });
    health.mongo = 'ok';
  } catch (error) {
    health.ok = false;
    health.mongo = error.message;
  }

  try {
    await withTimeout(ollama.list(), 'Ollama health check', 10000);
    health.ollama = 'ok';
  } catch (error) {
    health.ok = false;
    health.ollama = error.message;
  }

  res.status(health.ok ? 200 : 503).json(health);
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'auth' });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 8, keyPrefix: 'ai' });

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!username || password.length < 6) {
    return res.status(400).json({ error: 'Username and 6-character password are required.' });
  }

  try {
    const now = new Date();
    const result = await usersCollection.insertOne({
      username,
      passwordHash: hashPassword(password),
      profileCompleted: false,
      age: null,
      height: null,
      weight: null,
      caloric_target: null,
      protein_target: null,
      dietary_preferences: [],
      complications: [],
      allergies: [],
      goal: 'maintenance',
      diet_type: 'balanced',
      gender: 'not specified',
      activity_level: 'moderate',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    });

    const userId = result.insertedId.toString();
    const token = signToken({ sub: userId, role: 'user' });
    res.status(201).json({ token, userId, username });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Username already exists.' });
    res.status(500).json(errorPayload('Error creating account', error));
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await usersCollection.findOne({ username });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  await usersCollection.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  const userId = user._id.toString();
  const token = signToken({ sub: userId, role: 'user' });
  res.json({ token, userId, username });
});

app.post('/api/admin/login', authLimiter, requireAdmin, async (req, res) => {
  res.json({ ok: true, token: signToken({ sub: adminUsername, role: 'admin' }, 60 * 60 * 4), username: adminUsername });
});

app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  const [totalUsers, totalScans, foods, users] = await Promise.all([
    usersCollection.countDocuments(),
    foodItemsCollection.countDocuments(),
    foodItemsCollection.find({}).sort({ createdAt: -1 }).limit(500).toArray(),
    usersCollection.find({}).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);
  const activeSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const activeUsers = await usersCollection.countDocuments({ lastLoginAt: { $gte: activeSince } });
  const scoreValues = foods.map((food) => food.score?.score).filter((score) => Number.isFinite(score));
  const averageHealthScore = scoreValues.length
    ? Math.round(scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length)
    : 0;
  const foodCounts = new Map();
  foods.forEach((food) => foodCounts.set(food.name, (foodCounts.get(food.name) || 0) + 1));

  res.json({
    totalUsers,
    totalScans,
    activeUsers,
    averageHealthScore,
    mostScannedFoods: [...foodCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    users: users.map((user) => ({
      id: user._id.toString(),
      username: user.username || 'profile-only',
      profileCompleted: user.profileCompleted,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    })),
    recentScans: foods.slice(0, 20).map((food) => ({
      id: food._id.toString(),
      name: food.name,
      score: food.score,
      mealCategory: food.mealCategory || 'meal',
      createdAt: food.createdAt,
    })),
  });
});

app.get('/api/foods/search', (req, res) => {
  const query = String(req.query.q || '').toLowerCase();
  const foods = foodDatabase.filter((food) => food.name.toLowerCase().includes(query)).slice(0, 10);
  res.json({ foods });
});

app.get('/api/barcode/:code', (req, res) => {
  const food = foodDatabase.find((item) => item.barcode === req.params.code);
  if (!food) return res.status(404).json({ error: 'Barcode not found in demo database.' });
  res.json({ food });
});

app.get('/api/users/:userId', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);

  if (!userObjectId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const user = await usersCollection.findOne({ _id: userObjectId });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user: publicUser(user) });
});

app.post('/api/users', requireUser, async (req, res) => {
  res.status(410).json({ error: 'Use signup for accounts and PUT /api/users/:userId for profile updates.' });
});

app.put('/api/users/:userId', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);

  if (!userObjectId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const { userInfo, errors } = validateUserPayload(req.body);

  if (errors.length) {
    return res.status(400).json({ error: 'Invalid user information', details: errors });
  }

  try {
    const embedding = await getEmbedding(userInfo, 'updated user');
    const result = await usersCollection.findOneAndUpdate(
      { _id: userObjectId },
      {
        $set: {
          ...userInfo,
          profileCompleted: true,
          embedding,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );

    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User profile updated successfully',
      user: publicUser(result),
    });
  } catch (error) {
    console.error('Error updating user information:', error);
    res.status(500).json(errorPayload('Error updating user information', error));
  }
});

app.delete('/api/users/:userId', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);

  if (!userObjectId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  await Promise.all([
    usersCollection.deleteOne({ _id: userObjectId }),
    foodItemsCollection.deleteMany({ userId: userObjectId }),
  ]);

  res.json({ message: 'User profile and food history deleted' });
});

app.post('/api/recommend-food', requireUser, async (req, res) => {
  try {
    const { userId, foodItemId } = req.body;
    const userObjectId = req.userObjectId;
    const foodObjectId = toObjectId(foodItemId);

    if (userId && userId !== req.userId) {
      return res.status(403).json({ error: 'You can only request recommendations for your own profile.' });
    }

    if (!userObjectId || !foodObjectId) {
      return res.status(400).json({ error: 'Invalid userId or foodItemId' });
    }

    const user = await usersCollection.findOne({ _id: userObjectId });
    const foodItem = await foodItemsCollection.findOne({ _id: foodObjectId, userId: userObjectId });

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!foodItem) return res.status(404).json({ error: 'Food item not found' });

    const recommendation = await buildRecommendation(user, foodItem);

    await foodItemsCollection.updateOne(
      { _id: foodObjectId },
      { $set: { recommendation, updatedAt: new Date() } },
    );

    res.json(recommendation);
  } catch (error) {
    console.error('Error generating food recommendation:', error);
    res.status(500).json(errorPayload('Error generating food recommendation', error));
  }
});

app.get('/api/users/:userId/foods', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
  const skip = (page - 1) * limit;

  if (!userObjectId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const [foods, total] = await Promise.all([
    foodItemsCollection
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    foodItemsCollection.countDocuments({ userId: userObjectId }),
  ]);

  res.json({ foods: foods.map(publicFoodItem), page, limit, total, hasMore: skip + foods.length < total });
});

app.delete('/api/foods/:foodItemId', requireUser, async (req, res) => {
  const foodObjectId = toObjectId(req.params.foodItemId);

  if (!foodObjectId) {
    return res.status(400).json({ error: 'Invalid foodItemId' });
  }

  const result = await foodItemsCollection.deleteOne({ _id: foodObjectId, userId: req.userObjectId });
  if (!result.deletedCount) return res.status(404).json({ error: 'Food item not found' });
  res.json({ message: 'Food item deleted' });
});

app.patch('/api/foods/:foodItemId/favorite', requireUser, async (req, res) => {
  const foodObjectId = toObjectId(req.params.foodItemId);

  if (!foodObjectId) {
    return res.status(400).json({ error: 'Invalid foodItemId' });
  }

  const result = await foodItemsCollection.findOneAndUpdate(
    { _id: foodObjectId, userId: req.userObjectId },
    { $set: { favorite: Boolean(req.body.favorite), updatedAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!result) {
    return res.status(404).json({ error: 'Food item not found' });
  }

  res.json({ food: publicFoodItem(result) });
});

app.post('/api/users/:userId/manual-food', requireUser, requireSameUser, aiLimiter, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);

  if (!userObjectId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const user = await usersCollection.findOne({ _id: userObjectId });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { foodAnalysis: rawFoodAnalysis, errors } = parseFoodPayload(req.body);
  const foodAnalysis = withPortion(rawFoodAnalysis, req.body.portion, req.body.grams);
  const nutrition = normalizeNutrition(foodAnalysis);
  const mealCategory = String(req.body.mealCategory || 'meal').trim() || 'meal';
  const logDate = req.body.logDate ? new Date(req.body.logDate) : new Date();

  if (errors.length) {
    return res.status(400).json({ error: 'Invalid food information', details: errors });
  }

  try {
    const nutritionInfo = [{
      calories: foodAnalysis.Calories,
      totalFat: foodAnalysis['Total Fat'],
      cholesterol: foodAnalysis.Cholesterol,
      sodium: foodAnalysis.Sodium,
      carbohydrates: foodAnalysis.Carbohydrates,
      protein: foodAnalysis.Protein,
    }];
    const embedding = await getEmbedding(foodAnalysis, 'manual food');
    const score = buildNutritionScore(user, nutritionInfo[0], foodAnalysis['Food Item']);
    const now = new Date();
    const foodDocument = {
      userId: userObjectId,
      name: foodAnalysis['Food Item'],
      mealCategory,
      logDate,
      foodDescription: 'Manual food entry',
      foodAnalysis,
      nutrition,
      embedding,
      nutrition_info: nutritionInfo,
      score,
      warnings: score.warnings,
      alternatives: score.alternatives,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await foodItemsCollection.insertOne(foodDocument);
    const insertedFood = { ...foodDocument, _id: insertResult.insertedId };
    const recommendation = await buildRecommendation(user, insertedFood);

    await foodItemsCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: { recommendation, updatedAt: new Date() } },
    );

    res.status(201).json({
      message: 'Manual food stored successfully.',
      foodItemId: insertResult.insertedId.toString(),
      foodAnalysis,
      recommendation,
      score,
      warnings: score.warnings,
      alternatives: score.alternatives,
    });
  } catch (error) {
    console.error('Error storing manual food:', error);
    res.status(500).json(errorPayload('Error storing manual food', error));
  }
});

app.get('/api/users/:userId/dashboard', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);

  if (!userObjectId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const user = await usersCollection.findOne({ _id: userObjectId });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const foods = await foodItemsCollection
    .find({ userId: userObjectId, createdAt: { $gte: startOfDay } })
    .sort({ createdAt: -1 })
    .toArray();

  const totals = foods.reduce((acc, item) => {
    const nutrition = getNutritionInfo(item);
    acc.calories += numericNutritionValue(nutrition?.calories);
    acc.protein += numericNutritionValue(nutrition?.protein);
    acc.carbohydrates += numericNutritionValue(nutrition?.carbohydrates);
    acc.fat += numericNutritionValue(nutrition?.totalFat);
    return acc;
  }, { calories: 0, protein: 0, carbohydrates: 0, fat: 0 });
  const metrics = calculateBmiBmr(user);
  const macros = calculateMacros(totals);
  const nutrientAlerts = buildNutrientAlerts(user, totals);
  const goodCount = foods.filter((food) => food.score?.label === 'Good').length;
  const healthyRatio = foods.length ? Math.round((goodCount / foods.length) * 100) : 0;

  res.json({
    user: publicUser(user),
    totals,
    macros,
    metrics,
    nutrientAlerts,
    healthyRatio,
    goalProgress: {
      calories: user.caloric_target ? Math.min(100, Math.round((totals.calories / user.caloric_target) * 100)) : 0,
      protein: user.protein_target ? Math.min(100, Math.round((totals.protein / user.protein_target) * 100)) : 0,
    },
    targets: {
      calories: user.caloric_target,
      protein: user.protein_target,
    },
    recentFoods: foods.slice(0, 5).map(publicFoodItem),
  });
});

app.get('/api/users/:userId/report', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);

  if (!userObjectId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const foods = await foodItemsCollection
    .find({ userId: userObjectId, createdAt: { $gte: since } })
    .sort({ createdAt: 1 })
    .toArray();

  const dayMap = new Map();
  const scoreCounts = { Good: 0, Moderate: 0, Avoid: 0 };
  const nameCounts = new Map();
  let totalCalories = 0;
  let totalProtein = 0;

  foods.forEach((item) => {
    const day = new Date(item.createdAt).toISOString().slice(0, 10);
    const nutrition = getNutritionInfo(item);
    const calories = numericNutritionValue(nutrition?.calories);
    const protein = numericNutritionValue(nutrition?.protein);
    const current = dayMap.get(day) || { date: day, calories: 0, protein: 0, scans: 0 };

    current.calories += calories;
    current.protein += protein;
    current.scans += 1;
    dayMap.set(day, current);
    totalCalories += calories;
    totalProtein += protein;

    if (item.score?.label && scoreCounts[item.score.label] !== undefined) {
      scoreCounts[item.score.label] += 1;
    }

    const name = item.name || item.foodAnalysis?.['Food Item'] || 'Unknown';
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  });

  const topFood = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'No scans yet';
  const healthyCount = scoreCounts.Good;
  const healthyRatio = foods.length ? Math.round((healthyCount / foods.length) * 100) : 0;
  const loggedDays = new Set(foods.map((item) => new Date(item.createdAt).toISOString().slice(0, 10)));
  let streak = 0;
  for (let offset = 0; offset < 30; offset++) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    if (loggedDays.has(date.toISOString().slice(0, 10))) streak += 1;
    else break;
  }

  res.json({
    totalScans: foods.length,
    averageCalories: foods.length ? Math.round(totalCalories / foods.length) : 0,
    averageProtein: foods.length ? Math.round(totalProtein / foods.length) : 0,
    topFood,
    scoreCounts,
    healthyRatio,
    streak,
    daily: [...dayMap.values()],
  });
});

app.get('/api/users/:userId/tips', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);

  if (!userObjectId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const user = await usersCollection.findOne({ _id: userObjectId });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const tips = [
    `Aim for about ${Math.round(Number(user.protein_target || 60) / 3)}g protein in each main meal.`,
    'Add vegetables or salad to improve fullness without greatly increasing calories.',
    'Prefer grilled, steamed, roasted, or lightly sauteed options over deep-fried foods.',
  ];

  if (splitList(user.complications).join(' ').toLowerCase().includes('diabetes')) {
    tips.push('Pair carbohydrates with protein or fiber to reduce sugar spikes.');
  }

  if (splitList(user.complications).join(' ').toLowerCase().includes('hypertension')) {
    tips.push('Choose low-sodium options and avoid adding extra salt.');
  }

  res.json({ tips });
});

app.post('/api/users/:userId/meal-plan', requireUser, requireSameUser, aiLimiter, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);

  if (!userObjectId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const user = await usersCollection.findOne({ _id: userObjectId });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    const prompt = `Create a practical one-day meal plan for an Indian nutrition app user.
Goal: ${user.goal || 'maintenance'}
Diet type: ${user.diet_type || 'balanced'}
Calories: ${user.caloric_target}
Protein: ${user.protein_target}g
Preferences: ${splitList(user.dietary_preferences).join(', ') || 'none'}
Health conditions: ${splitList(user.complications).join(', ') || 'none'}
Allergies: ${splitList(user.allergies).join(', ') || 'none'}

Return concise JSON only with keys breakfast, lunch, snack, dinner. Each value should have name, calories, protein, and reason.`;

    const response = await withTimeout(
      ollama.generate({
        model: chatModel,
        prompt,
        options: { num_predict: 280, temperature: 0.35 },
      }),
      'meal plan generation',
    );

    let plan;
    try {
      const jsonText = response.response.match(/\{[\s\S]*\}/)?.[0] || response.response;
      plan = JSON.parse(jsonText);
    } catch {
      plan = {
        breakfast: { name: 'Oats with curd and fruit', calories: 350, protein: 18, reason: 'Balanced start with fiber and protein.' },
        lunch: { name: 'Dal, brown rice, salad and curd', calories: 550, protein: 25, reason: 'Steady energy with familiar Indian foods.' },
        snack: { name: 'Sprout chaat', calories: 220, protein: 14, reason: 'High fiber, light and protein-rich.' },
        dinner: { name: 'Paneer/tofu tikka with vegetables', calories: 500, protein: 30, reason: 'Protein-focused dinner with fewer refined carbs.' },
      };
    }

    res.json({ plan: normalizeMealPlan(plan) });
  } catch (error) {
    console.error('Error generating meal plan:', error);
    res.status(500).json(errorPayload('Error generating meal plan', error));
  }
});

app.post('/api/users/:userId/compare-foods', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  const firstId = toObjectId(req.body.firstFoodId);
  const secondId = toObjectId(req.body.secondFoodId);

  if (!userObjectId || !firstId || !secondId) {
    return res.status(400).json({ error: 'Invalid comparison request' });
  }

  const foods = await foodItemsCollection
    .find({ _id: { $in: [firstId, secondId] }, userId: userObjectId })
    .toArray();

  if (foods.length !== 2) {
    return res.status(404).json({ error: 'Both foods must exist in this profile history' });
  }

  const [first, second] = foods;
  const firstScore = first.score?.score || 0;
  const secondScore = second.score?.score || 0;
  const winner = firstScore >= secondScore ? first : second;

  res.json({
    winner: publicFoodItem(winner),
    foods: foods.map(publicFoodItem),
    reason: `${winner.name} is the better match because it has the stronger nutrition score for your profile.`,
  });
});

app.post('/api/users/:userId/weight-logs', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  const weight = parseNumber(req.body.weight);

  if (!userObjectId || !weight) {
    return res.status(400).json({ error: 'Valid userId and weight are required.' });
  }

  const date = req.body.date ? new Date(req.body.date) : new Date();
  await weightLogsCollection.insertOne({ userId: userObjectId, weight, date, createdAt: new Date() });
  await usersCollection.updateOne({ _id: userObjectId }, { $set: { weight, updatedAt: new Date() } });
  res.status(201).json({ message: 'Weight logged.' });
});

app.get('/api/users/:userId/weight-logs', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  if (!userObjectId) return res.status(400).json({ error: 'Invalid userId' });
  const logs = await weightLogsCollection.find({ userId: userObjectId }).sort({ date: 1 }).limit(50).toArray();
  res.json({ logs: logs.map((log) => ({ id: log._id.toString(), weight: log.weight, date: log.date })) });
});

app.post('/api/users/:userId/chat', requireUser, requireSameUser, aiLimiter, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  const question = String(req.body.question || '').trim();
  if (!userObjectId || !question) return res.status(400).json({ error: 'Question is required.' });
  const user = await usersCollection.findOne({ _id: userObjectId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const response = await withTimeout(ollama.generate({
    model: chatModel,
    prompt: `Answer as a concise nutrition coach. Profile: ${JSON.stringify(publicUser(user))}. Question: ${question}`,
    options: { num_predict: 220, temperature: 0.35 },
  }), 'nutrition chatbot');
  res.json({ answer: response.response });
});

app.post('/api/users/:userId/coach', requireUser, requireSameUser, aiLimiter, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  if (!userObjectId) return res.status(400).json({ error: 'Invalid userId' });
  const [user, foods] = await Promise.all([
    usersCollection.findOne({ _id: userObjectId }),
    foodItemsCollection.find({ userId: userObjectId }).sort({ createdAt: -1 }).limit(10).toArray(),
  ]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const totals = foods.reduce((acc, item) => {
    const nutrition = getNutritionInfo(item);
    acc.calories += numericNutritionValue(nutrition?.calories);
    acc.protein += numericNutritionValue(nutrition?.protein);
    acc.sodium += numericNutritionValue(nutrition?.sodium);
    return acc;
  }, { calories: 0, protein: 0, sodium: 0 });
  const response = await withTimeout(ollama.generate({
    model: chatModel,
    prompt: `Give today's diet coaching in 3 bullets. Profile: ${JSON.stringify(publicUser(user))}. Recent totals: ${JSON.stringify(totals)}.`,
    options: { num_predict: 180, temperature: 0.25 },
  }), 'AI diet coach');
  res.json({ coaching: response.response, totals });
});

app.post('/api/users/:userId/explain-score', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  const foodObjectId = toObjectId(req.body.foodItemId);
  if (!userObjectId || !foodObjectId) return res.status(400).json({ error: 'Invalid request.' });
  const food = await foodItemsCollection.findOne({ _id: foodObjectId, userId: userObjectId });
  if (!food) return res.status(404).json({ error: 'Food item not found.' });
  res.json({
    explanation: [
      `Score: ${food.score?.label || 'Moderate'} (${food.score?.score || 0}/100).`,
      ...(food.score?.reasons || []),
      ...(food.warnings || []),
    ],
  });
});

app.post('/api/users/:userId/regional-suggestions', requireUser, requireSameUser, aiLimiter, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  const region = String(req.body.region || 'North Indian');
  if (!userObjectId) return res.status(400).json({ error: 'Invalid userId' });
  const user = await usersCollection.findOne({ _id: userObjectId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const response = await withTimeout(ollama.generate({
    model: chatModel,
    prompt: `Suggest 5 ${region} meals for this nutrition profile: ${JSON.stringify(publicUser(user))}. Include calories and protein.`,
    options: { num_predict: 260, temperature: 0.35 },
  }), 'regional suggestions');
  res.json({ suggestions: response.response });
});

app.post('/api/users/:userId/recipe', requireUser, requireSameUser, aiLimiter, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  const ingredients = splitList(req.body.ingredients);
  if (!userObjectId || !ingredients.length) return res.status(400).json({ error: 'Ingredients are required.' });
  const user = await usersCollection.findOne({ _id: userObjectId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const response = await withTimeout(ollama.generate({
    model: chatModel,
    prompt: `Create a healthy recipe using ${ingredients.join(', ')} for this profile: ${JSON.stringify(publicUser(user))}. Include steps and nutrition estimate.`,
    options: { num_predict: 300, temperature: 0.4 },
  }), 'recipe generation');
  res.json({ recipe: response.response });
});

app.post('/api/users/:userId/weekly-email', requireUser, requireSameUser, async (req, res) => {
  const userObjectId = toObjectId(req.params.userId);
  if (!userObjectId) return res.status(400).json({ error: 'Invalid userId' });
  const [user, foods] = await Promise.all([
    usersCollection.findOne({ _id: userObjectId }),
    foodItemsCollection.find({ userId: userObjectId }).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);
  const summary = `Weekly Summary: ${foods.length} foods logged. Good: ${foods.filter((f) => f.score?.label === 'Good').length}, Moderate: ${foods.filter((f) => f.score?.label === 'Moderate').length}, Avoid: ${foods.filter((f) => f.score?.label === 'Avoid').length}.`;
  const recipient = String(req.body.email || user?.email || '').trim();

  if (smtpHost && smtpUser && smtpPass && recipient) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: recipient,
      subject: 'Nutriveda Weekly Summary',
      text: summary,
    });

    return res.json({ message: 'Weekly email sent.', summary, sent: true });
  }

  res.json({ message: 'Email sending is simulated until SMTP_HOST, SMTP_USER, SMTP_PASS and recipient email are configured.', summary, sent: false, mailto: `mailto:?subject=Nutriveda Weekly Summary&body=${encodeURIComponent(summary)}` });
});

app.post('/api/analyze-food', requireUser, aiLimiter, upload.single('image'), async (req, res) => {
  try {
    const userId = req.userId;
    const userObjectId = toObjectId(userId);

    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid or missing userId' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const user = await usersCollection.findOne({ _id: userObjectId });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const imageBase64 = req.file.buffer.toString('base64');

    console.log('Analyzing image with vision model...');
    const visionResponse = await withTimeout(
      ollama.generate({
        model: visionModel,
        prompt: 'Identify the food in this image. Return a short description with dish name, visible main ingredients, and cuisine if obvious.',
        images: [imageBase64],
        options: {
          num_predict: 120,
          temperature: 0.1,
        },
      }),
      'image analysis',
    );

    if (!visionResponse?.response) {
      throw new Error('No valid response from vision model');
    }

    console.log('Generating nutrition estimate...');
    const nutritionResponse = await withTimeout(
      ollama.generate({
        model: chatModel,
        prompt: `Estimate nutrition for this food: ${visionResponse.response}.
Return JSON only using this schema:
{"foodItem":"dish name","calories":number,"totalFat":number,"cholesterol":number,"sodium":number,"carbohydrates":number,"protein":number}
Use kcal for calories, grams for fat/carbohydrates/protein, and mg for sodium/cholesterol.`,
        options: {
          num_predict: 130,
          temperature: 0.1,
        },
      }),
      'nutrition analysis',
    );

    if (!nutritionResponse?.response) {
      throw new Error('No valid response from nutrition model');
    }

    const foodItemsData = parseNutritionJson(nutritionResponse.response) || defaultNutritionForDescription(visionResponse.response);

    const foodItemName = foodItemsData['Food Item'] || 'Unknown food';
    const ingredients = estimateIngredients(visionResponse.response);
    const embedding = await getEmbedding(foodItemsData, 'food');
    const nutrition = normalizeNutrition(foodItemsData);
    const nutritionInfo = [{
      calories: foodItemsData.Calories,
      totalFat: foodItemsData['Total Fat'],
      cholesterol: foodItemsData.Cholesterol,
      sodium: foodItemsData.Sodium,
      carbohydrates: foodItemsData.Carbohydrates,
      protein: foodItemsData.Protein,
    }];

    const foodDocument = {
      userId: userObjectId,
      name: foodItemName,
      foodDescription: visionResponse.response,
      ingredients,
      mealCategory: String(req.body.mealCategory || 'meal').trim() || 'meal',
      logDate: req.body.logDate ? new Date(req.body.logDate) : new Date(),
      foodAnalysis: foodItemsData,
      nutrition,
      embedding,
      nutrition_info: nutritionInfo,
      score: buildNutritionScore(user, nutritionInfo[0], foodItemName, ingredients),
      favorite: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    foodDocument.warnings = foodDocument.score.warnings;
    foodDocument.alternatives = foodDocument.score.alternatives;

    const insertResult = await foodItemsCollection.insertOne(foodDocument);
    const insertedFood = {
      ...foodDocument,
      _id: insertResult.insertedId,
    };

    const recommendation = await buildRecommendation(user, insertedFood);

    await foodItemsCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: { recommendation, updatedAt: new Date() } },
    );

    res.json({
      message: 'Food item analyzed and stored successfully.',
      foodItemId: insertResult.insertedId.toString(),
      foodDescription: visionResponse.response,
      foodAnalysis: foodItemsData,
      recommendation,
      score: foodDocument.score,
      warnings: foodDocument.warnings,
      alternatives: foodDocument.alternatives,
    });
  } catch (error) {
    console.error('Error analyzing image:', error);
    res.status(500).json(errorPayload('Error analyzing image', error));
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error(`Unhandled error in ${req.method} ${req.originalUrl}:`, error);
  res.status(500).json(errorPayload('Unexpected server error', error));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
