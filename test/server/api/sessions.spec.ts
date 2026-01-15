import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import { sessionsRouter } from '../../../src/server/api/sessions.js';
import { SessionStore } from '../../../src/server/sessions/SessionStore.js';
import { getRedisClient, closeRedis } from '../../../src/server/database/redis.js';

describe('Sessions API', () => {
  let app: express.Application;
  let sessionStore: SessionStore;
  let redis: ReturnType<typeof getRedisClient>;
  const createdSessions: string[] = [];

  before(() => {
    app = express();
    app.use(express.json());
    app.use('/api/sessions', sessionsRouter);

    redis = getRedisClient();
    sessionStore = new SessionStore();
  });

  after(async () => {
    // Cleanup all test sessions
    for (const sessionId of createdSessions) {
      try {
        await sessionStore.deleteSession(sessionId);
      } catch {
        // Ignore errors
      }
    }
    await closeRedis();
  });

  beforeEach(async () => {
    // Clean up any existing sessions
    const keys = await redis.keys('sessions:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.del('sessions:all');
  });

  describe('GET /api/sessions', () => {
    it('should return empty array when no sessions exist', async () => {
      const res = await request(app)
        .get('/api/sessions')
        .expect(200);

      expect(res.body).to.have.property('sessions');
      expect(res.body.sessions).to.be.an('array').that.is.empty;
    });

    it('should return all sessions', async () => {
      // Create test sessions
      const session1 = await sessionStore.createSession(
        'api-test-1',
        ['bash'],
        { cols: 80, rows: 24 }
      );
      const session2 = await sessionStore.createSession(
        'api-test-2',
        ['bash'],
        { cols: 80, rows: 24 }
      );

      createdSessions.push(session1.id, session2.id);

      const res = await request(app)
        .get('/api/sessions')
        .expect(200);

      expect(res.body.sessions).to.have.lengthOf(2);
      expect(res.body.sessions[0]).to.have.property('id');
      expect(res.body.sessions[0]).to.have.property('name');
      expect(res.body.sessions[0]).to.have.property('metadata');
    });
  });

  describe('POST /api/sessions', () => {
    it('should create a new session', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .send({
          name: 'new-session',
          command: 'bash',
          cols: 80,
          rows: 24
        })
        .expect(201);

      expect(res.body).to.have.property('session');
      expect(res.body.session).to.have.property('id');
      expect(res.body.session).to.have.property('name', 'new-session');
      expect(res.body.session).to.have.property('status', 'active');

      createdSessions.push(res.body.session.id);
    });

    it('should return 400 if name is missing', async () => {
      await request(app)
        .post('/api/sessions')
        .send({ command: 'bash' })
        .expect(400);
    });

    it('should use default command if not provided', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .send({
          name: 'default-cmd-session',
          cols: 80,
          rows: 24
        })
        .expect(201);

      expect(res.body.session.metadata).to.have.property('command');
      createdSessions.push(res.body.session.id);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should get a specific session', async () => {
      const session = await sessionStore.createSession(
        'get-specific',
        ['bash'],
        { cols: 80, rows: 24 }
      );
      createdSessions.push(session.id);

      const res = await request(app)
        .get(`/api/sessions/${session.id}`)
        .expect(200);

      expect(res.body.session).to.have.property('id', session.id);
      expect(res.body.session).to.have.property('name', 'get-specific');
    });

    it('should return 404 for non-existent session', async () => {
      await request(app)
        .get('/api/sessions/non-existent-id')
        .expect(404);
    });
  });

  describe('PUT /api/sessions/:id', () => {
    it('should rename a session', async () => {
      const session = await sessionStore.createSession(
        'old-name',
        ['bash'],
        { cols: 80, rows: 24 }
      );
      createdSessions.push(session.id);

      const res = await request(app)
        .put(`/api/sessions/${session.id}`)
        .send({ name: 'new-name' })
        .expect(200);

      expect(res.body.session).to.have.property('name', 'new-name');
    });

    it('should return 400 if name is missing', async () => {
      const session = await sessionStore.createSession(
        'test',
        ['bash'],
        { cols: 80, rows: 24 }
      );
      createdSessions.push(session.id);

      await request(app)
        .put(`/api/sessions/${session.id}`)
        .send({})
        .expect(400);
    });

    it('should return 404 for non-existent session', async () => {
      await request(app)
        .put('/api/sessions/non-existent')
        .send({ name: 'test' })
        .expect(404);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should delete a session', async () => {
      const session = await sessionStore.createSession(
        'to-delete',
        ['bash'],
        { cols: 80, rows: 24 }
      );

      await request(app)
        .delete(`/api/sessions/${session.id}`)
        .expect(200);

      // Verify it's gone
      const retrieved = await sessionStore.getSession(session.id);
      expect(retrieved).to.be.null;
    });

    it('should succeed even for non-existent session', async () => {
      await request(app)
        .delete('/api/sessions/non-existent')
        .expect(200);
    });
  });

  describe('GET /api/sessions/:id/preview', () => {
    it('should get session preview', async () => {
      const session = await sessionStore.createSession(
        'preview-test',
        ['bash'],
        { cols: 80, rows: 24 }
      );
      createdSessions.push(session.id);

      const res = await request(app)
        .get(`/api/sessions/${session.id}/preview`)
        .expect(200);

      expect(res.body).to.have.property('preview');
      expect(res.body.preview).to.be.a('string');
    });

    it('should accept lines query parameter', async () => {
      const session = await sessionStore.createSession(
        'preview-lines',
        ['bash'],
        { cols: 80, rows: 24 }
      );
      createdSessions.push(session.id);

      await request(app)
        .get(`/api/sessions/${session.id}/preview?lines=20`)
        .expect(200);
    });
  });
});
