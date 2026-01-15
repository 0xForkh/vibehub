import { expect } from 'chai';
import { SessionStore } from '../../../src/server/sessions/SessionStore.js';
import { TmuxManager } from '../../../src/server/sessions/TmuxManager.js';
import { getRedisClient, closeRedis } from '../../../src/server/database/redis.js';

describe('SessionStore', () => {
  let sessionStore: SessionStore;
  let tmuxManager: TmuxManager;
  let redis: ReturnType<typeof getRedisClient>;

  before(async () => {
    redis = getRedisClient();
    sessionStore = new SessionStore();
    tmuxManager = new TmuxManager();

    // Check if tmux is available
    const tmuxInstalled = await tmuxManager.checkTmuxInstalled();
    if (!tmuxInstalled) {
      console.warn('⚠️  tmux not installed, some tests may fail');
    }
  });

  after(async () => {
    await closeRedis();
  });

  beforeEach(async () => {
    // Clean up any existing test sessions
    const keys = await redis.keys('sessions:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.del('sessions:all');
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await sessionStore.createSession(
        'test-session',
        ['bash'],
        { cols: 80, rows: 24 }
      );

      expect(session).to.have.property('id');
      expect(session).to.have.property('name', 'test-session');
      expect(session).to.have.property('tmuxSessionName');
      expect(session.tmuxSessionName).to.match(/^vibehub_/);
      expect(session).to.have.property('status', 'active');
      expect(session.metadata).to.deep.equal({ cols: 80, rows: 24 });

      // Verify tmux session was created
      const tmuxExists = await tmuxManager.sessionExists(session.tmuxSessionName);
      expect(tmuxExists).to.be.true;

      // Cleanup
      await sessionStore.deleteSession(session.id);
    });

    it('should store session in Redis', async () => {
      const session = await sessionStore.createSession(
        'redis-test',
        ['bash'],
        { cols: 100, rows: 30 }
      );

      // Verify in Redis
      const stored = await redis.hgetall(`sessions:${session.id}`);
      expect(stored).to.have.property('id', session.id);
      expect(stored).to.have.property('name', 'redis-test');

      // Verify metadata is JSON stringified
      const metadata = JSON.parse(stored.metadata);
      expect(metadata).to.deep.equal({ cols: 100, rows: 30 });

      // Verify in sessions set
      const inSet = await redis.sismember('sessions:all', session.id);
      expect(inSet).to.equal(1);

      // Cleanup
      await sessionStore.deleteSession(session.id);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', async () => {
      const created = await sessionStore.createSession(
        'get-test',
        ['bash'],
        { cols: 80, rows: 24 }
      );

      const retrieved = await sessionStore.getSession(created.id);

      expect(retrieved).to.not.be.null;
      expect(retrieved?.id).to.equal(created.id);
      expect(retrieved?.name).to.equal('get-test');
      expect(retrieved?.metadata).to.deep.equal({ cols: 80, rows: 24 });

      // Cleanup
      await sessionStore.deleteSession(created.id);
    });

    it('should return null for non-existent session', async () => {
      const session = await sessionStore.getSession('non-existent-id');
      expect(session).to.be.null;
    });
  });

  describe('listSessions', () => {
    it('should list all sessions', async () => {
      const session1 = await sessionStore.createSession(
        'session-1',
        ['bash'],
        { cols: 80, rows: 24 }
      );
      const session2 = await sessionStore.createSession(
        'session-2',
        ['bash'],
        { cols: 80, rows: 24 }
      );

      const sessions = await sessionStore.listSessions();

      expect(sessions).to.have.lengthOf(2);
      expect(sessions.map(s => s.name)).to.include.members(['session-1', 'session-2']);

      // Cleanup
      await sessionStore.deleteSession(session1.id);
      await sessionStore.deleteSession(session2.id);
    });

    it('should return empty array when no sessions exist', async () => {
      const sessions = await sessionStore.listSessions();
      expect(sessions).to.be.an('array').that.is.empty;
    });
  });

  describe('deleteSession', () => {
    it('should delete a session and kill tmux', async () => {
      const session = await sessionStore.createSession(
        'delete-test',
        ['bash'],
        { cols: 80, rows: 24 }
      );

      await sessionStore.deleteSession(session.id);

      // Verify removed from Redis
      const stored = await redis.hgetall(`sessions:${session.id}`);
      expect(stored).to.deep.equal({});

      const inSet = await redis.sismember('sessions:all', session.id);
      expect(inSet).to.equal(0);

      // Verify tmux session killed
      const tmuxExists = await tmuxManager.sessionExists(session.tmuxSessionName);
      expect(tmuxExists).to.be.false;
    });
  });

  describe('updateSession', () => {
    it('should update session name', async () => {
      const session = await sessionStore.createSession(
        'old-name',
        ['bash'],
        { cols: 80, rows: 24 }
      );

      const updated = await sessionStore.updateSession(session.id, {
        name: 'new-name'
      });

      expect(updated).to.not.be.null;
      expect(updated?.name).to.equal('new-name');

      // Verify in Redis
      const stored = await redis.hgetall(`sessions:${session.id}`);
      expect(stored.name).to.equal('new-name');

      // Cleanup
      await sessionStore.deleteSession(session.id);
    });

    it('should return null for non-existent session', async () => {
      const updated = await sessionStore.updateSession('non-existent', {
        name: 'test'
      });
      expect(updated).to.be.null;
    });
  });

  describe('touchSession', () => {
    it('should update lastAccessedAt timestamp', async () => {
      const session = await sessionStore.createSession(
        'touch-test',
        ['bash'],
        { cols: 80, rows: 24 }
      );

      const originalTime = session.lastAccessedAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      await sessionStore.touchSession(session.id);

      const updated = await sessionStore.getSession(session.id);
      expect(updated?.lastAccessedAt).to.not.equal(originalTime);

      // Cleanup
      await sessionStore.deleteSession(session.id);
    });
  });
});
