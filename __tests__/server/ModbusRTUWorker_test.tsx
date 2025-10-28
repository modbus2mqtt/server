import { describe, expect, it } from '@jest/globals'
import { ModbusRTUWorker } from '../../src/server/modbusRTUworker'
import { IModbusAPI } from '../../src/server/modbusWorker'
import { IQueueEntry, ModbusErrorActions, ModbusRTUQueue } from '../../src/server/modbusRTUqueue'
import { ModbusRegisterType } from '../../src/specification.shared'
import { ModbusTasks } from '../../src/server.shared'
import { Itest, ModbusRTUWorkerForTest, FakeBus } from './testhelper'

function enqueue(queue: ModbusRTUQueue, num: number, test: Itest) {
  queue.enqueue(
    1,
    { registerType: ModbusRegisterType.HoldingRegister, address: num },
    (qe, data) => {
      // validate no paralell processing
      expect(test.worker!.isRunningForTest).toBeFalsy()
      test.worker!.isRunningForTest = true

      expect(data).toBeDefined()
      expect(data![0]).toBe(num)
      test.worker!.isRunningForTest = false
    },
    (e) => {
      return ModbusErrorActions.handledNoReconnect
    },
    { task: ModbusTasks.specification, errorHandling: {} }
  )
}
function enqueueWrite(queue: ModbusRTUQueue, num: number, test: Itest) {
  queue.enqueue(
    1,
    { registerType: ModbusRegisterType.HoldingRegister, address: num, write: [num] },
    () => {
      // validate no paralell processing
      expect(test.worker!.isRunningForTest).toBeFalsy()
      test.worker!.isRunningForTest = true
      test.worker!.isRunningForTest = false
    },
    (e) => {
      return ModbusErrorActions.handledNoReconnect
    },
    { task: ModbusTasks.specification, errorHandling: {} }
  )
}
it('Sequential read successful processing', (done) => {
  let queue = new ModbusRTUQueue()
  let test: Itest = {}
  enqueue(queue, 199, test) //CRC
  enqueue(queue, 200, test) //Timeout

  test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
  test.worker.expectedReconnected = false
  test.worker.expectedAPIcallCount = 1
  test.worker.expectedAPIwroteDataCount = 0
  test.worker.expectedRequestCountSpecification = 3
  test.worker.run()
  // Hopefully, the run process resetted the queue before next queue entry is added
  enqueue(queue, 201, test)
})

describe('ModbusRTUWorker read', () => {
  it('Sequential read error processing', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 199 },
      (qe, result) => {
        expect(result![0]).toBe(1)
      },
      (e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true } }
    )
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 200 },
      (qe, result) => {
        expect(result![0]).toBe(1)
      },
      (qe, e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true } }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    test.worker.expectedReconnected = true
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
  })
  it('Sequential read error Illegal Function code', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    let fb = new FakeBus()
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 198 },
      (qe, result) => {
        expect(true).toBeFalsy()
      },
      (qe, e) => {
        fb.callCount = 199 // unique identifier to validate in onFinish()
      },
      { task: ModbusTasks.specification, errorHandling: {} }
    )
    test.worker = new ModbusRTUWorkerForTest(fb, queue, done, 'read')
    test.worker.expectedReconnected = false
    test.worker.expectedAPIcallCount = 199
    test.worker.run()
  })

  it('Sequential read error processing with reconnect', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 199 },
      (qe, result) => {
        expect(result![0]).toBe(1)
      },
      (qe, e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true } }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    test.worker.expectedReconnected = true
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
  })

  it('Sequential read error processing with split', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 202, length: 3 },
      (qe, result) => {
        expect(result![0]).toBe(1)
      },
      (qe, e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true, split: true } }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    test.worker.expectedReconnected = true
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
  })

  it('Sequential read error processing: Timeout', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 200 },
      (qe, result) => {
        // should not be called, because of error
        expect(result![0]).toBe(1)
      },
      (qe, e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true } }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'readExcpetion')
    test.worker.expectedReconnected = false
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
  })
})
function genCacheEntry(
  address: number,
  onResult: (queueEntry: IQueueEntry, result: number[] | undefined) => void,
  onError: (queueEntry: IQueueEntry, error: any) => void
): IQueueEntry {
  return {
    slaveId: 1,
    address: { address: address, length: 1, registerType: ModbusRegisterType.HoldingRegister },
    options: { useCache: true, task: ModbusTasks.specification, errorHandling: {} },
    onResolve: onResult,
    onError: onError,
  }
}
class RTUWorkerCached extends ModbusRTUWorker {
  constructor(
    api: IModbusAPI,
    queue: ModbusRTUQueue,
    private onFinishP: () => void,
    public currentDate: Date = new Date(2025, 1, 1, 5, 0, 0, 0)
  ) {
    super(api, queue)
  }

  protected override getCurrentDate(): Date {
    return new Date(this.currentDate.getTime())
  }
  override onFinish(): void {
    this.onFinishP()
  }
}
describe('ModbusRTUWorker Cache', () => {
  it('updateCacheError', () => {
    let queue = new ModbusRTUQueue()
    let worker = new RTUWorkerCached(new FakeBus(), queue, () => {})
    let e199 = genCacheEntry(
      199,
      (qe, result) => {},
      () => {}
    )

    worker['updateCache'](e199, [-199])
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data![0]).toBe(-199)
    worker['updateCache'](e199, [-201])
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data![0]).toBe(-201)
    worker['updateCacheError'](e199, new Error('Error'))
    // Cache Entry is "new"
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data![0]).toBe(-201)
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.error).toBeUndefined()
    worker.currentDate = new Date(2025, 1, 1, 13, 0, 0, 0)
    // Entry is "old"
    worker['updateCacheError'](e199, new Error('Error'))
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data).toBeUndefined()
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.error).toBeDefined()
  })
  it('cleanupCache', () => {
    let queue = new ModbusRTUQueue()
    let worker = new RTUWorkerCached(new FakeBus(), queue, () => {})
    let e199 = genCacheEntry(
      199,
      (qe, result) => {},
      () => {}
    )
    // expired entry
    let e200 = genCacheEntry(
      200,
      (qe, result) => {},
      () => {}
    )
    worker['updateCache'](e199, [-199])
    let cd = worker.currentDate
    worker.currentDate = new Date(2025, 1, 1, 5 - 13, 0, 0, 0)
    worker['updateCache'](e200, [-200])
    worker.currentDate = cd
    worker['cleanupCache']()
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data).toBeDefined()
    expect(worker['cache'].get(1)!.holdingRegisters.get(200)).toBeUndefined()
  })
  it('Read from cache', (done) => {
    let queue = new ModbusRTUQueue()
    let onResultCallCount = 0
    let onErrorCallCount = 0
    let e199 = genCacheEntry(
      199,
      (qe, result) => {
        onResultCallCount++
        expect(result![0]).toBe(2)
      },
      () => {
        onErrorCallCount++
      }
    )
    let e200 = genCacheEntry(
      200,
      (qe, result) => {
        onResultCallCount++
        expect(result![0]).toBe(2)
      },
      () => {
        onErrorCallCount++
      }
    )
    let e201 = genCacheEntry(
      201,
      (qe, result) => {
        onResultCallCount++
        expect(result![0]).toBe(3)
      },
      () => {
        onErrorCallCount++
      }
    )
    let worker = new RTUWorkerCached(new FakeBus(), queue, () => {
      expect(onResultCallCount).toBe(2)
      expect(onErrorCallCount).toBe(1)
      done()
    })
    worker['updateCache'](e199, [2])
    worker['updateCacheError'](e200, new Error('Error'))
    worker['updateCache'](e201, [3])
    queue.enqueueEntry(e199)
    queue.enqueueEntry(e200)
    queue.enqueueEntry(e201)
    worker.run()
  })
})
describe('ModbusRTUWorker write', () => {
  it('Sequential read and write successful processing', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    enqueue(queue, 199, test)
    enqueueWrite(queue, 200, test)

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'write')
    test.worker.expectedReconnected = false
    test.worker.expectedAPIcallCount = 1
    test.worker.expectedAPIwroteDataCount = 2
    test.worker.run()
    // Hopefully, the run process resetted the queue before next queue entry is added
    enqueueWrite(queue, 201, test)
  })
})
