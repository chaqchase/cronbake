import Baker from '@/lib/baker';
import Cron from '@/lib/cron';
import CronParser from '@/lib/parser';
import {
  expect,
  describe,
  it,
  afterEach,
  beforeEach,
  jest,
  Mock,
} from 'bun:test';

describe('Baker', () => {
  let baker: Baker;
  beforeEach(() => {
    baker = new Baker();
  });

  afterEach(() => {
    baker.destroyAll();
  });

  it('Should check all the presets', () => {
    const presets = ['@daily', '@hourly', '@monthly', '@weekly', '@yearly'];
    presets.forEach((preset) => {
      const parser = new CronParser(preset);
      const cronTime = parser.parse();
      expect(cronTime).toBeDefined();
    });
  });

  it('should add a cron job', () => {
    const cron = baker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    expect(cron).toBeDefined();
    expect(cron.name).toBe('test');
  });

  it('should prevent duplicate job names', () => {
    baker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    
    expect(() => {
      baker.add({
        name: 'test',
        cron: '0 * * * * *',
        callback: jest.fn(),
      });
    }).toThrow("Cron job with name 'test' already exists");
  });

  it('should validate cron job names', () => {
    expect(() => {
      baker.add({
        name: '',
        cron: '* * * * * *',
        callback: jest.fn(),
      });
    }).toThrow('Cron job name is required and must be a string');
  });

  it('should validate custom preset bounds', () => {
    expect(() => {
      baker.add({
        name: 'test',
        cron: '@every_0_seconds',
        callback: jest.fn(),
      });
    }).toThrow('Invalid value in custom preset');

    expect(() => {
      baker.add({
        name: 'test2',
        cron: '@at_25:30',
        callback: jest.fn(),
      });
    }).toThrow('Invalid time in custom preset');

    expect(() => {
      baker.add({
        name: 'test3',
        cron: '@between_23_5',
        callback: jest.fn(),
      });
    }).toThrow('Invalid hour range in custom preset');
  });

  it('should remove a cron job', () => {
    baker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.remove('test');
    expect(baker.isRunning('test')).toBeFalsy();
  });

  it('should start a cron job', () => {
    baker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.bake('test');
    expect(baker.isRunning('test')).toBeTruthy();
  });

  it('should stop a cron job', () => {
    baker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.bake('test');
    baker.stop('test');
    expect(baker.isRunning('test')).toBeFalsy();
  });

  it('should pause and resume a cron job', () => {
    const cron = baker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    
    cron.start();
    expect(cron.getStatus()).toBe('running');
    
    baker.pause('test');
    expect(baker.getStatus('test')).toBe('paused');
    
    baker.resume('test');
    expect(baker.getStatus('test')).toBe('running');
  });

  it('should destroy a cron job', () => {
    baker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.destroy('test');
    expect(baker.isRunning('test')).toBeFalsy();
  });

  it('should start all cron jobs', () => {
    baker.add({
      name: 'test1',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.add({
      name: 'test2',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.bakeAll();
    expect(baker.isRunning('test1')).toBeTruthy();
    expect(baker.isRunning('test2')).toBeTruthy();
  });

  it('should stop all cron jobs', () => {
    baker.add({
      name: 'test1',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.add({
      name: 'test2',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.bakeAll();
    baker.stopAll();
    expect(baker.isRunning('test1')).toBeFalsy();
    expect(baker.isRunning('test2')).toBeFalsy();
  });

  it('should pause all cron jobs', () => {
    baker.add({
      name: 'test1',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.add({
      name: 'test2',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.bakeAll();
    baker.pauseAll();
    expect(baker.getStatus('test1')).toBe('paused');
    expect(baker.getStatus('test2')).toBe('paused');
  });

  it('should resume all cron jobs', () => {
    baker.add({
      name: 'test1',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.add({
      name: 'test2',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.bakeAll();
    baker.pauseAll();
    baker.resumeAll();
    expect(baker.getStatus('test1')).toBe('running');
    expect(baker.getStatus('test2')).toBe('running');
  });

  it('should destroy all cron jobs', () => {
    baker.add({
      name: 'test1',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.add({
      name: 'test2',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.destroyAll();
    expect(baker.isRunning('test1')).toBeFalsy();
    expect(baker.isRunning('test2')).toBeFalsy();
  });

  it('should get job names', () => {
    baker.add({
      name: 'test1',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    baker.add({
      name: 'test2',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    
    const names = baker.getJobNames();
    expect(names).toContain('test1');
    expect(names).toContain('test2');
    expect(names.length).toBe(2);
  });

  it('should get all jobs', () => {
    const cron1 = baker.add({
      name: 'test1',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    const cron2 = baker.add({
      name: 'test2',
      cron: '* * * * * *',
      callback: jest.fn(),
    });
    
    const allJobs = baker.getAllJobs();
    expect(allJobs.get('test1')).toBe(cron1);
    expect(allJobs.get('test2')).toBe(cron2);
    expect(allJobs.size).toBe(2);
  });

  it('should track metrics without long execution', () => {
    const callback = jest.fn();

    const cron = baker.add({
      name: 'test',
      cron: '0 0 0 1 1 *',
      callback,
    });

    const metrics = baker.getMetrics('test');
    const history = baker.getHistory('test');
    
    expect(metrics.totalExecutions).toBe(0);
    expect(history.length).toBe(0);
    expect(typeof metrics.averageExecutionTime).toBe('number');
  });

  it('should handle job errors in configuration', () => {
    const errorCallback = jest.fn(() => {
      throw new Error('Test error');
    });

    const onError = jest.fn();

    const cron = baker.add({
      name: 'test',
      cron: '0 0 0 1 1 *',
      callback: errorCallback,
      onError,
    });

    expect(cron.onError).toBeDefined();
  });

  it('should reset metrics', () => {
    const cron = baker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });

    cron.resetMetrics();
    
    const metrics = baker.getMetrics('test');
    expect(metrics.totalExecutions).toBe(0);
    expect(metrics.successfulExecutions).toBe(0);
    expect(metrics.failedExecutions).toBe(0);
  });

  it('should handle Baker configuration options', () => {
    const onError = jest.fn();
    const configuredBaker = new Baker({
      autoStart: false,
      enableMetrics: true,
      onError,
      schedulerConfig: {
        pollingInterval: 2000,
        useCalculatedTimeouts: false,
        maxHistoryEntries: 50,
      },
    });

    const cron = configuredBaker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });

    expect(cron).toBeDefined();
    expect(configuredBaker.isRunning('test')).toBeFalsy();
    
    configuredBaker.destroyAll();
  });

  it('should handle persistence configuration', async () => {
    const persistenceBaker = new Baker({
      persistence: {
        enabled: false,
        filePath: './test-state.json',
        autoRestore: false,
      },
    });

    const cron = persistenceBaker.add({
      name: 'test',
      cron: '* * * * * *',
      callback: jest.fn(),
    });

    expect(cron).toBeDefined();
    
    persistenceBaker.destroyAll();
  });
});

describe('CronParser', () => {
  let parser: CronParser<string>;

  beforeEach(() => {
    parser = new CronParser('* * * * * *');
  });

  it('should parse the cron expression', () => {
    const cronTime = parser.parse();
    expect(cronTime).toBeDefined();
    expect(cronTime.second).toBeDefined();
    expect(cronTime.minute).toBeDefined();
    expect(cronTime.hour).toBeDefined();
    expect(cronTime.dayOfMonth).toBeDefined();
    expect(cronTime.month).toBeDefined();
    expect(cronTime.dayOfWeek).toBeDefined();
  });

  it('should get the next execution time', () => {
    const nextExecution = parser.getNext();
    expect(nextExecution).toBeInstanceOf(Date);
    expect(nextExecution.getTime()).toBeGreaterThan(Date.now());
  });

  it('should get the previous execution time', () => {
    const previousExecution = parser.getPrevious();
    expect(previousExecution).toBeInstanceOf(Date);
    expect(previousExecution.getTime()).toBeLessThan(Date.now());
  });

  it('should parse custom presets correctly', () => {
    const customParser = new CronParser('@every_5_minutes');
    const cronTime = customParser.parse();
    expect(cronTime.minute).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it('should parse @at_ presets correctly', () => {
    const atParser = new CronParser('@at_14:30');
    const cronTime = atParser.parse();
    expect(cronTime.hour).toEqual([14]);
    expect(cronTime.minute).toEqual([30]);
  });

  it('should parse @between_ presets correctly', () => {
    const betweenParser = new CronParser('@between_9_17');
    const cronTime = betweenParser.parse();
    expect(cronTime.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('should parse @on_ presets correctly', () => {
    const onParser = new CronParser('@on_monday');
    const cronTime = onParser.parse();
    expect(cronTime.dayOfWeek).toEqual([2]);
  });

  it('should handle range expressions', () => {
    const rangeParser = new CronParser('1-5 * * * * *');
    const cronTime = rangeParser.parse();
    expect(cronTime.second).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle step expressions', () => {
    const stepParser = new CronParser('*/5 * * * * *');
    const cronTime = stepParser.parse();
    expect(cronTime.second).toContain(0);
    expect(cronTime.second).toContain(5);
    expect(cronTime.second).toContain(10);
  });

  it('should handle list expressions', () => {
    const listParser = new CronParser('1,3,5 * * * * *');
    const cronTime = listParser.parse();
    expect(cronTime.second).toEqual([1, 3, 5]);
  });
});

describe('Cron', () => {
  let cron: Cron;

  beforeEach(() => {
    cron = new Cron({
      name: 'test',
      cron: '0 0 0 1 1 *',
      callback: jest.fn(),
    });
  });

  afterEach(() => {
    cron.destroy();
  });

  it('should validate cron job name', () => {
    expect(() => {
      new Cron({
        name: '',
        cron: '* * * * * *',
        callback: jest.fn(),
      });
    }).toThrow('Cron job name is required and must be a string');
  });

  it('should validate cron expressions', () => {
    expect(() => {
      new Cron({
        name: 'test',
        cron: '* * * * *',
        callback: jest.fn(),
      });
    }).toThrow('Invalid cron expression');
  });

  it('should start the cron job', () => {
    cron.start();
    expect(cron.isRunning()).toBeTruthy();
    expect(cron.getStatus()).toBe('running');
  });

  it('should stop the cron job', () => {
    cron.start();
    cron.stop();
    expect(cron.isRunning()).toBeFalsy();
    expect(cron.getStatus()).toBe('stopped');
  });

  it('should pause and resume the cron job', () => {
    cron.start();
    expect(cron.getStatus()).toBe('running');
    
    cron.pause();
    expect(cron.getStatus()).toBe('paused');
    expect(cron.isRunning()).toBeFalsy();
    
    cron.resume();
    expect(cron.getStatus()).toBe('running');
    expect(cron.isRunning()).toBeTruthy();
  });

  it('should destroy the cron job', () => {
    cron.destroy();
    expect(cron.isRunning()).toBeFalsy();
    expect(cron.getStatus()).toBe('stopped');
  });

  it('should get the status of the cron job', () => {
    const status = cron.getStatus();
    expect(status).toBeDefined();
    expect(['running', 'stopped', 'paused', 'error']).toContain(status);
  });

  it('should check if the cron job is running', () => {
    const isRunning = cron.isRunning();
    expect(typeof isRunning).toBe('boolean');
  });

  it('should get the date of the last execution of the cron job', () => {
    const lastExecution = cron.lastExecution();
    expect(lastExecution).toBeInstanceOf(Date);
  });

  it('should get the date of the next execution of the cron job', () => {
    const nextExecution = cron.nextExecution();
    expect(nextExecution).toBeInstanceOf(Date);
  });

  it('should get the remaining time until the next execution of the cron job', () => {
    const remaining = cron.remaining();
    expect(typeof remaining).toBe('number');
  });

  it('should get the time until the next execution of the cron job', () => {
    const time = cron.time();
    expect(typeof time).toBe('number');
  });

  it('should get execution history', () => {
    const history = cron.getHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it('should get metrics', () => {
    const metrics = cron.getMetrics();
    expect(metrics).toHaveProperty('totalExecutions');
    expect(metrics).toHaveProperty('successfulExecutions');
    expect(metrics).toHaveProperty('failedExecutions');
    expect(metrics).toHaveProperty('averageExecutionTime');
  });

  it('should reset metrics', () => {
    cron.resetMetrics();
    const metrics = cron.getMetrics();
    expect(metrics.totalExecutions).toBe(0);
    expect(metrics.successfulExecutions).toBe(0);
    expect(metrics.failedExecutions).toBe(0);
    expect(metrics.averageExecutionTime).toBe(0);
  });

  it('should validate cron expressions using static method', () => {
    expect(Cron.isValid('* * * * * *')).toBe(true);
    expect(Cron.isValid('@daily')).toBe(true);
    expect(Cron.isValid('invalid')).toBe(false);
  });

  it('should parse cron expressions using static method', () => {
    const cronTime = Cron.parse('* * * * * *');
    expect(cronTime).toBeDefined();
    expect(cronTime.second).toBeDefined();
  });

  it('should get next execution using static method', () => {
    const next = Cron.getNext('* * * * * *');
    expect(next).toBeInstanceOf(Date);
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  it('should get previous execution using static method', () => {
    const previous = Cron.getPrevious('* * * * * *');
    expect(previous).toBeInstanceOf(Date);
    expect(previous.getTime()).toBeLessThan(Date.now());
  });

  it('should handle async callbacks configuration', async () => {
    let executed = false;
    const asyncCallback = async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      executed = true;
    };

    const asyncCron = new Cron({
      name: 'async-test',
      cron: '0 0 0 1 1 *',
      callback: asyncCallback,
    });

    expect(asyncCron.callback).toBeDefined();
    
    asyncCron.destroy();
  });

  it('should support priority levels', () => {
    const highPriorityCron = new Cron({
      name: 'high-priority',
      cron: '* * * * * *',
      callback: jest.fn(),
      priority: 10,
    });

    expect(highPriorityCron.priority).toBe(10);
    highPriorityCron.destroy();
  });

  it('should handle configuration options', () => {
    const configuredCron = new Cron({
      name: 'configured-test',
      cron: '* * * * * *',
      callback: jest.fn(),
      maxHistory: 200,
      onError: jest.fn(),
      onTick: jest.fn(),
      onComplete: jest.fn(),
    }, 
    {
      useCalculatedTimeouts: false,
      pollingInterval: 2000,
    });

    expect(configuredCron.name).toBe('configured-test');
    expect(configuredCron.priority).toBe(0);
    
    configuredCron.destroy();
  });

  it('should validate custom preset values', () => {
    expect(() => {
      new Cron({
        name: 'test',
        cron: '@every_-1_seconds',
        callback: jest.fn(),
      });
    }).toThrow('Invalid value in custom preset');
  });

  it('should validate @at_ preset time bounds', () => {
    expect(() => {
      new Cron({
        name: 'test',
        cron: '@at_24:00',
        callback: jest.fn(),
      });
    }).toThrow('Invalid time in custom preset');
  });

  it('should validate @between_ preset hour ranges', () => {
    expect(() => {
      new Cron({
        name: 'test',
        cron: '@between_18_6',
        callback: jest.fn(),
      });
    }).toThrow('Invalid hour range in custom preset');
  });
});