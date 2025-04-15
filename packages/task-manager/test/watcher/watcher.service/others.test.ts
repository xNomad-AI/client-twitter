import { jest } from '@jest/globals';

import { CatchCronError, TimeoutMap } from '../../../src/watcher/watcher.service.js';

describe('TimeoutMap', () => {
  let timeoutMap: TimeoutMap<string>;

  beforeEach(() => {
    timeoutMap = new TimeoutMap<string>(1000); // 1 second timeout
  });

  it('should add and retrieve values', () => {
    timeoutMap.add('key1', 100);
    timeoutMap.add('key1', 200);

    expect(timeoutMap.get('key1')).toEqual([100, 200]);
  });

  it('should return undefined for non-existing keys', () => {
    expect(timeoutMap.get('nonexistent')).toBeUndefined();
  });

  it('should delete keys', () => {
    timeoutMap.add('key1', 100);
    expect(timeoutMap.has('key1')).toBeTruthy();

    timeoutMap.delete('key1');
    expect(timeoutMap.has('key1')).toBeFalsy();
  });

  it('should clear all items', () => {
    timeoutMap.add('key1', 100);
    timeoutMap.add('key2', 200);

    timeoutMap.clear();

    expect(timeoutMap.has('key1')).toBeFalsy();
    expect(timeoutMap.has('key2')).toBeFalsy();
  });

  it('should expire items after timeout', async () => {
    jest.useFakeTimers();

    timeoutMap = new TimeoutMap<string>(500); // 500ms timeout
    timeoutMap.add('key1', 100);

    expect(timeoutMap.has('key1')).toBeTruthy();

    // Advance time beyond the timeout
    jest.advanceTimersByTime(600);

    expect(timeoutMap.has('key1')).toBeFalsy();
    jest.useRealTimers();
  });
});

describe('CatchCronError decorator', () => {
  it('should wrap method execution with try/catch', async () => {
    // Create a test class with decorated method
    class TestClass {
      methodCalled = false;
      
      @CatchCronError('* * * * *')
      async testMethod() {
        this.methodCalled = true;
        return 'success';
      }
    }
    
    const testInstance = new TestClass();
    const result = await testInstance.testMethod();
    
    expect(testInstance.methodCalled).toBeTruthy();
    expect(result).toBe('success');
  });

  it('should catch errors thrown by decorated method', async () => {
    const errorMsg = 'Test error';
    
    class TestClass {
      @CatchCronError('* * * * *')
      async testMethod() {
        throw new Error(errorMsg);
      }
    }
    
    const testInstance = new TestClass();
    await expect(testInstance.testMethod()).rejects.toThrow(errorMsg);
  });
});
