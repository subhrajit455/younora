const request = require('supertest');
const app = require('../../src/app');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

describe('Integration: Health & Core Middleware', () => {
  describe('GET /health (Liveness Probe)', () => {
    test('returns 200 with standard success envelope', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Server is healthy',
      });
      expect(res.body.data).toHaveProperty('uptime');
      expect(res.body.data).toHaveProperty('timestamp');
      expect(res.body.data.service).toBe('younora-backend');
    });

    test('is also accessible under /api/v1/health', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /health/ready (Readiness Probe)', () => {
    test('returns 503 when database is disconnected', async () => {
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database connection is not ready',
      });
    });

    test('returns 200 when database is connected', async () => {
      await startTestDb();

      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Server and dependencies are ready',
      });
      expect(res.body.data.database).toBe('connected');

      await stopTestDb();
    });
  });

  describe('404 & Global Error Handling', () => {
    test('unknown routes return 404 with standard error envelope', async () => {
      const res = await request(app).get('/api/v1/non-existent-endpoint');

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
      });
      expect(res.body.message).toContain('Route GET /api/v1/non-existent-endpoint not found');
    });
  });
});

