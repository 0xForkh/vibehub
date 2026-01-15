import { expect } from 'chai';
import { TmuxManager } from '../../../src/server/sessions/TmuxManager.js';

describe('TmuxManager', () => {
  let tmuxManager: TmuxManager;
  const testSessions: string[] = [];

  before(() => {
    tmuxManager = new TmuxManager();
  });

  after(async () => {
    // Cleanup all test sessions
    for (const sessionName of testSessions) {
      try {
        await tmuxManager.killSession(sessionName);
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  describe('checkTmuxInstalled', () => {
    it('should detect if tmux is installed', async () => {
      const installed = await tmuxManager.checkTmuxInstalled();
      expect(installed).to.be.a('boolean');

      if (!installed) {
        console.warn('⚠️  tmux not installed - skipping tmux tests');
      }
    });
  });

  describe('createSession', function() {
    this.timeout(5000); // tmux operations can be slow

    it('should create a new tmux session', async () => {
      const sessionName = `test_create_${Date.now()}`;
      testSessions.push(sessionName);

      await tmuxManager.createSession(sessionName, ['bash'], 80, 24);

      const exists = await tmuxManager.sessionExists(sessionName);
      expect(exists).to.be.true;
    });

    it('should create session with specific dimensions', async () => {
      const sessionName = `test_dims_${Date.now()}`;
      testSessions.push(sessionName);

      await tmuxManager.createSession(sessionName, ['bash'], 100, 30);

      const exists = await tmuxManager.sessionExists(sessionName);
      expect(exists).to.be.true;
    });
  });

  describe('sessionExists', () => {
    it('should return true for existing session', async () => {
      const sessionName = `test_exists_${Date.now()}`;
      testSessions.push(sessionName);

      await tmuxManager.createSession(sessionName, ['bash'], 80, 24);
      const exists = await tmuxManager.sessionExists(sessionName);

      expect(exists).to.be.true;
    });

    it('should return false for non-existent session', async () => {
      const exists = await tmuxManager.sessionExists('non_existent_session_xyz');
      expect(exists).to.be.false;
    });
  });

  describe('listSessions', () => {
    it('should list all tmux sessions', async () => {
      const sessionName = `test_list_${Date.now()}`;
      testSessions.push(sessionName);

      await tmuxManager.createSession(sessionName, ['bash'], 80, 24);
      const sessions = await tmuxManager.listSessions();

      expect(sessions).to.be.an('array');
      const sessionNames = sessions.map(s => s.name);
      expect(sessionNames).to.include(sessionName);
    });

    it('should return session metadata', async () => {
      const sessionName = `test_meta_${Date.now()}`;
      testSessions.push(sessionName);

      await tmuxManager.createSession(sessionName, ['bash'], 80, 24);
      const sessions = await tmuxManager.listSessions();

      const session = sessions.find(s => s.name === sessionName);
      expect(session).to.exist;
      expect(session).to.have.property('windows');
      expect(session).to.have.property('created');
      expect(session).to.have.property('attached');
    });
  });

  describe('killSession', () => {
    it('should kill an existing session', async () => {
      const sessionName = `test_kill_${Date.now()}`;
      testSessions.push(sessionName);

      await tmuxManager.createSession(sessionName, ['bash'], 80, 24);

      let exists = await tmuxManager.sessionExists(sessionName);
      expect(exists).to.be.true;

      await tmuxManager.killSession(sessionName);

      exists = await tmuxManager.sessionExists(sessionName);
      expect(exists).to.be.false;
    });

    it('should throw error for non-existent session', async () => {
      try {
        await tmuxManager.killSession('non_existent_xyz');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.be.an('error');
      }
    });
  });

  describe('capturePane', () => {
    it('should capture pane output', async () => {
      const sessionName = `test_capture_${Date.now()}`;
      testSessions.push(sessionName);

      await tmuxManager.createSession(sessionName, ['bash'], 80, 24);
      const output = await tmuxManager.capturePane(sessionName, 10);

      expect(output).to.be.a('string');
      // Output might be empty for a fresh bash session
    });
  });
});
