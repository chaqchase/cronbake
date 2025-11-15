import { describe, it, expect } from 'bun:test';
import Baker from '@/lib/baker';
import { createFileProvider, createRedisProvider, cleanupFile, sleep } from '@/lib/test/utils';

describe('Persistence Providers', () => {
  it('File provider: saves and restores jobs', async () => {
    const { provider, filePath } = createFileProvider();

    const baker1 = new Baker({
      persistence: { enabled: true, autoRestore: false, strategy: 'file', provider },
    });

    baker1.add({ name: 'file-job', cron: '* * * * * *', callback: () => {} });
    await baker1.saveState();

    const baker2 = new Baker({
      persistence: { enabled: true, autoRestore: true, strategy: 'file', provider },
    });
    await sleep(10);
    expect(baker2.getJobNames()).toContain('file-job');
    // Stop timers and persist final state before cleanup
    baker2.stopAll();
    baker1.stopAll();
    await baker2.saveState();
    cleanupFile(filePath);
  });

  it('Redis provider: saves and restores jobs with fake client', async () => {
    const { provider } = createRedisProvider('test:cronbake');

    const baker1 = new Baker({
      persistence: { enabled: true, autoRestore: false, strategy: 'redis', provider },
    });
    baker1.add({ name: 'redis-job', cron: '* * * * * *', callback: () => {} });
    await baker1.saveState();

    const baker2 = new Baker({
      persistence: { enabled: true, autoRestore: true, strategy: 'redis', provider },
    });
    await sleep(10);
    expect(baker2.getJobNames()).toContain('redis-job');
    baker2.destroyAll();
    baker1.destroyAll();
  });

  it('Throws if redis strategy without provider', () => {
    expect(() => new Baker({ persistence: { enabled: true, strategy: 'redis' } })).toThrow();
  });

  it('allows overriding restored jobs with new definitions', async () => {
    const { provider, filePath } = createFileProvider();

    const baker1 = new Baker({
      persistence: { enabled: true, autoRestore: false, strategy: 'file', provider },
    });
    baker1.add({ name: 'restored-job', cron: '@daily', callback: () => {} });
    await baker1.saveState();
    baker1.destroyAll();

    const baker2 = new Baker({
      persistence: { enabled: true, autoRestore: true, strategy: 'file', provider },
    });
    await sleep(10);
    const restored = baker2.getAllJobs().get('restored-job');
    expect(restored?.cron).toBe('@daily');

    baker2.add({ name: 'restored-job', cron: '@hourly', callback: () => {} });
    const updated = baker2.getAllJobs().get('restored-job');
    expect(updated?.cron).toBe('@hourly');

    baker2.destroyAll();
    await baker2.saveState();
    cleanupFile(filePath);
  });

  it('skips restoring jobs already defined before restore runs', async () => {
    const { provider, filePath } = createFileProvider();

    const baker1 = new Baker({
      persistence: { enabled: true, autoRestore: false, strategy: 'file', provider },
    });
    baker1.add({ name: 'predefined-job', cron: '@daily', callback: () => {} });
    await baker1.saveState();
    baker1.destroyAll();

    const baker2 = new Baker({
      persistence: { enabled: true, autoRestore: false, strategy: 'file', provider },
    });
    baker2.add({ name: 'predefined-job', cron: '@hourly', callback: () => {} });
    await baker2.restoreState();
    const job = baker2.getAllJobs().get('predefined-job');
    expect(job?.cron).toBe('@hourly');

    baker2.destroyAll();
    await baker2.saveState();
    cleanupFile(filePath);
  });
});
