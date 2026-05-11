import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('auth endpoints issue signed tokens', () => {
  assert.match(source, /signToken\(\{ sub: userId, role: 'user' \}/);
  assert.match(source, /signToken\(\{ sub: adminUsername, role: 'admin' \}/);
});

test('profile writes require authenticated owner', () => {
  assert.match(source, /app\.put\('\/api\/users\/:userId', requireUser, requireSameUser/);
  assert.match(source, /app\.delete\('\/api\/users\/:userId', requireUser, requireSameUser/);
});

test('food mutations are scoped to the authenticated user', () => {
  assert.match(source, /deleteOne\(\{ _id: foodObjectId, userId: req\.userObjectId \}/);
  assert.match(source, /findOneAndUpdate\(\s*\{ _id: foodObjectId, userId: req\.userObjectId \}/);
});

test('high-cost AI routes are rate limited', () => {
  assert.match(source, /app\.post\('\/api\/analyze-food', requireUser, aiLimiter/);
  assert.match(source, /app\.post\('\/api\/users\/:userId\/chat', requireUser, requireSameUser, aiLimiter/);
  assert.match(source, /app\.post\('\/api\/users\/:userId\/recipe', requireUser, requireSameUser, aiLimiter/);
  assert.match(source, /app\.post\('\/api\/users\/:userId\/coach', requireUser, requireSameUser, aiLimiter/);
});

test('public profile creation endpoint is disabled', () => {
  assert.match(source, /app\.post\('\/api\/users', requireUser/);
  assert.match(source, /res\.status\(410\)/);
});
