import { ModbusRTUQueue, IQueueEntry, IQueueOptions } from './ModbusRTUQueue'
import { IModbusAPI, ModbusWorker } from './ModbusWorker'
import { IModbusResultOrError, Logger, LogLevelEnum } from '@modbus2mqtt/specification'
import Debug from 'debug'
import { IexecuteOptions } from './ModbusRTUProcessor'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { ImodbusAddress, ImodbusErrorsForSlave, ModbusErrorStates, ModbusTasks } from '@modbus2mqtt/server.shared'

const debug = Debug('modbusrtuworker')
const log = new Logger('modbusrtuworker')
const logNoticeMaxWaitTime = 1000 * 60 * 30 // 30 minutes
const maxErrorRetriesCrc = 4
const maxErrorRetriesTimeout = 1
const maxErrorRetriesOther = 1
const errorCleanTimeout = 60 * 60 * 1 * 1000 // 1 hour
const errorTimeout = 60 * 60 * 5 * 1000 // 5 hours
const dataTimeout = 60 * 60 * 10 * 1000 // 10 hours
interface IModbusResultCache extends IModbusResultOrError {
  date: Date
}
class ModbusErrorDescription {
  constructor(
    private queueEntry: IQueueEntry,
    private state: ModbusErrorStates,
    public date: Date = new Date()
  ) {}
  getModbusErorForSlave(): ImodbusErrorsForSlave {
    return {
      date: this.date.getTime(),
      task: this.queueEntry.options.task,
      address: this.queueEntry.address,
      state: this.state,
    }
  }
}
interface ImodbusValuesCache {
  holdingRegisters: Map<number, IModbusResultCache>
  analogInputs: Map<number, IModbusResultCache>
  coils: Map<number, IModbusResultCache>
  discreteInputs: Map<number, IModbusResultCache>
  errors: ModbusErrorDescription[]
}
export class ModbusRTUWorker extends ModbusWorker {
  private isRunning = false
  private static lastNoticeMessageTime: number
  private static lastNoticeMessage: string
  private static caches = new Map<number, Map<number, ImodbusValuesCache>>()
  private cache:Map<number, ImodbusValuesCache>

  constructor(modbusAPI: IModbusAPI, queue: ModbusRTUQueue) {
    super(modbusAPI, queue)
    let c = ModbusRTUWorker.caches.get(modbusAPI.getCacheId())
    if(c)
      this.cache = c
    else
      ModbusRTUWorker.caches.set(modbusAPI.getCacheId(), this.cache = new Map<number, ImodbusValuesCache>())
  }
  debugMessage(currentEntry: IQueueEntry, msg: string) {
    let id =
      'slave: ' +
      currentEntry.slaveId +
      ' Reg: ' +
      currentEntry.address.registerType +
      ' Address: ' +
      currentEntry.address.address +
      ' (l: ' +
      (currentEntry.address.length ? currentEntry.address.length : 1) +
      ')'
    debug(id + ': ' + msg)
  }

  private logNotice(msg: string, options: IexecuteOptions) {
    if (options == undefined || !options.printLogs) {
      debug(msg)
      return
    }
    // suppress similar duplicate messages
    let repeatMessage =
      ModbusRTUWorker.lastNoticeMessageTime != undefined &&
      ModbusRTUWorker.lastNoticeMessageTime + logNoticeMaxWaitTime < Date.now()
    if (repeatMessage || msg != ModbusRTUWorker.lastNoticeMessage) {
      ModbusRTUWorker.lastNoticeMessage = msg
      ModbusRTUWorker.lastNoticeMessageTime = Date.now()
      log.log(LogLevelEnum.notice, options.task ? options.task + ' ' : '' + msg)
    }
  }
  private retry(current: IQueueEntry, error: any): Promise<void> {
    // retry is not configured
    if (!current.options.errorHandling.retry)
      return new Promise((resolve, reject) => {
        reject(error)
      })
    if (current.errorState == undefined || [ModbusErrorStates.noerror].includes(current.errorState))
      return new Promise((resolve, reject) => {
        reject(new Error('Retry is not helpful'))
      })
    if (current.errorCount != undefined) current.errorCount++
    else current.errorCount = 1

    let maxErrors = 0
    switch (current.errorState) {
      case ModbusErrorStates.crc:
        if (current.errorCount >= maxErrorRetriesCrc)
          return new Promise((resolve, reject) => {
            reject(new Error('Too many retries crc'))
          })
        return new Promise<void>((resolve, reject) => {
          this.modbusAPI
            .reconnectRTU('ReconnectOnError')
            .then(() => {
              debug('Reconnected')
              this.executeModbusFunctionCodeRead(current).then(resolve).catch(reject)
            })
            .catch((e1) => {
              log.log(LogLevelEnum.error, 'Unable to reconnect: ' + e1.message)
              reject(e1)
            })
        })
      case ModbusErrorStates.timeout:
        maxErrors = maxErrorRetriesTimeout
        break
      default:
        maxErrors = maxErrorRetriesOther
    }
    if (current.errorCount > maxErrors)
      return new Promise((resolve, reject) => {
        reject(new Error('Too many retries: ' + (current.errorState== ModbusErrorStates.timeout? 'timeout':'other')))
      })
    else {
      this.debugMessage(current, 'Retrying ...')
      return this.executeModbusFunctionCodeRead(current)
    }
  }

  private splitAddresses(entry: IQueueEntry, e: any): void {
    // split request into single parts to avoid invalid address errors as often as possible
    let length = entry.address.length != undefined ? entry.address.length : 1
    if (length > 1) {
      let address: ImodbusAddress = {
        address: entry.address.address,
        registerType: entry.address.registerType,
        length: 1,
      }
      for (let l = 0; l < length; l++) {
        this.queue.enqueue(entry.slaveId, structuredClone(address), entry.onResolve, entry.onError, {
          task: ModbusTasks.splitted,
          errorHandling: {},
          useCache: entry.options.useCache
        }as IQueueOptions)
        address.address++
      }
    } else throw e
  }
  private logErrorInCache(current: IQueueEntry, state: ModbusErrorStates) {
    this.addError(current, state, new Date())
  }

  private handleErrors(current: IQueueEntry, error: any): Promise<void> {
    if (error == undefined)
      return new Promise((resolve, reject) => {
        reject(new Error('Unable to handle undefined error'))
      })

    current.error = error
    if (this.cache.get(current.slaveId) == undefined) this.cache.set(current.slaveId, this.createEmptyIModbusValues())
    if (error.message.includes('CRC error')) {
      current.errorState = ModbusErrorStates.crc
      this.logErrorInCache(current, ModbusErrorStates.crc)
      if (current.options.errorHandling.split && current.address.length != undefined && current.address.length > 1) {
        this.splitAddresses(current, error) // will reject if split is not possible
        // Wait for reconnect before handling new queue entries
        return this.modbusAPI.reconnectRTU('ReconnectOnError')
      } else return this.retry(current, error)
    } else if (error.errno == 'ETIMEDOUT')
      if (current.options.errorHandling.split&&current.address.length != undefined && current.address.length > 1) 
        {
          this.splitAddresses(current, error)
          // New entries are queued. Nothing more to do
          return new Promise((resolve) => {
            resolve()
          })
        } else {
            current.errorState = ModbusErrorStates.timeout
            this.addError(current, ModbusErrorStates.timeout, new Date())
            return this.retry(current, error)
          }
    else {
      let modbusCode = error.modbusCode
      if (modbusCode == undefined)
        return new Promise((resolve, reject) => {
          current.errorState = ModbusErrorStates.other
          this.addError(current, ModbusErrorStates.other)
          return this.retry(current, error)
        })
      switch (modbusCode) {
        case 1: //Illegal Function Code. No need to retry
          current.errorState = ModbusErrorStates.other
          this.addError(current, ModbusErrorStates.illegalfunctioncode)
          return new Promise((resolve, reject) => {
            reject(new Error('Unable to handle Illegal function code'))
          })
        case 2: // Illegal Address. No need to retry
          current.errorState = ModbusErrorStates.other
          this.addError(current, ModbusErrorStates.illegaladdress)
          return new Promise((resolve, reject) => {
            reject(new Error('Unable to handle Illegal address'))
          })
        default:
          current.errorState = ModbusErrorStates.crc
          this.addError(current, ModbusErrorStates.crc)
          return this.retry(current, error)
      }
    }
  }
  private createEmptyIModbusValues(): ImodbusValuesCache {
    return {
      holdingRegisters: new Map<number, IModbusResultCache>(),
      analogInputs: new Map<number, IModbusResultCache>(),
      coils: new Map<number, IModbusResultCache>(),
      discreteInputs: new Map<number, IModbusResultCache>(),
      errors: [],
    }
  }

  private getSelectedMap(current: IQueueEntry, values: ImodbusValuesCache): Map<number, IModbusResultCache> | undefined {
    let table: Map<number, IModbusResultCache> | undefined = undefined
    switch (current.address.registerType) {
      case ModbusRegisterType.AnalogInputs:
        table = values.analogInputs
        break
      case ModbusRegisterType.Coils:
        table = values.coils
        break
      case ModbusRegisterType.DiscreteInputs:
        table = values.discreteInputs
        break
      case ModbusRegisterType.HoldingRegister:
        table = values.holdingRegisters
        break
    }
    return table
  }
  private getCachedMap(current: IQueueEntry): Map<number, IModbusResultCache> | undefined {
    let cacheEntry = this.cache.get(current.slaveId)
    let f: IModbusResultOrError
    if (cacheEntry == undefined) {
      cacheEntry = this.createEmptyIModbusValues()
      this.cache.set(current.slaveId, cacheEntry)
    }
    return this.getSelectedMap(current, cacheEntry)
  }
  private updateCache(current: IQueueEntry, result: number[]) {
    let table = this.getCachedMap(current)
    if (table != undefined)
      for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
        if (result[idx] == undefined) debug
        if (result.length > idx)
          table.set(current.address.address + idx, structuredClone({ data: [result[idx]], date: this.getCurrentDate() }))
      }
  }
  // for testing
  protected getCurrentDate(): Date {
    return new Date()
  }
  private updateCacheError(current: IQueueEntry, error: Error) {
    let table = this.getCachedMap(current)
    if (table != undefined)
      for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
        let cv = table.get(current.address.address + idx)

        if (cv && cv.data) {
          // overwrite with error only if really old
          let expired: Date = this.getCurrentDate()
          expired.setTime(cv.date.getTime() + errorTimeout)
          if (expired < this.getCurrentDate()) {
            // expired is more than errorTimeout (5 hours) old
            let k = 7
            table.set(current.address.address + idx, { error: error, date: this.getCurrentDate() })
          }
        } // No data available
        else table.set(current.address.address + idx, { error: error, date: this.getCurrentDate() })
      }
  }

  private isInCacheMap(current: IQueueEntry): Map<number, IModbusResultOrError> | undefined {
    if (current.options && current.options.useCache) {
      let mp = this.getCachedMap(current)
      if (mp != undefined) {
        for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
          let rc = mp.get(current.address.address + idx)
          if (rc == undefined) return undefined
        }
        return mp
      }
    }
    return undefined
  }

  private executeModbusFunctionCodeRead(current: IQueueEntry): Promise<void> {
    let mp = this.isInCacheMap(current)
    if (mp != undefined) {
      return new Promise<void>((resolve, reject) => {
        current.errorState = ModbusErrorStates.noerror
        // Read from Cache
        for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
          let rc = mp!.get(current.address.address + idx)
          let tmpEntry: IQueueEntry = {
            address: { address: current.address.address + idx, length: 1, registerType: current.address.registerType },
            slaveId: current.slaveId,
            onResolve: current.onResolve,
            onError: current.onError,
            options: current.options,
          }
          if (rc != undefined && rc.data != undefined) tmpEntry.onResolve(tmpEntry, rc.data)
          else if (rc!.error != undefined) tmpEntry.onError(tmpEntry, rc!.error)
          else tmpEntry.onError(tmpEntry, new Error('Unknown error when reading from cache'))
        }
        resolve()
      })
    } else
      return new Promise<void>((resolve, reject) => {
        let fct = this.functionCodeReadMap.get(current.address.registerType)
        fct!(current.slaveId, current.address.address, current.address.length == undefined ? 1 : current.address.length)
          .then((result) => {
            delete current.error
            if (current.errorState != undefined && current.errorState != ModbusErrorStates.noerror)
              this.debugMessage(current, ' was successful now')
            current.errorState = ModbusErrorStates.noerror
            if (result.data) {
              this.updateCache(current, result.data)
              current.onResolve(current, result.data)
            }
            resolve()
          })
          .catch((e) => {
            this.handleErrors(current, e)
              .then((result) => {
                resolve()
              })
              .catch((e) => {
                this.debugMessage(current, ' failed permanently')
                this.updateCacheError(current, e)
                current.onError(current, e)
                resolve()
              })
          })
      })
  }
  private cleanCacheTable(table: Map<number, IModbusResultCache>): void {
    let notExpired: Date = this.getCurrentDate()
    notExpired.setTime(notExpired.getTime() - dataTimeout)
    table.forEach((v, key) => {
      if (v.date < notExpired) table.delete(key)
    })
  }
  public cleanupCache(): void {
    this.cache.forEach((v) => {
      this.cleanCacheTable(v.holdingRegisters)
      this.cleanCacheTable(v.analogInputs)
      this.cleanCacheTable(v.discreteInputs)
      this.cleanCacheTable(v.coils)
      let notExpired: Date = this.getCurrentDate()
      notExpired.setTime(notExpired.getTime() - errorCleanTimeout)
      v.errors.forEach((e, idx) => {
        if (e.date < notExpired) v.errors.splice(idx, 1)
      })
    })
  }
  public addError(queueEntry: IQueueEntry, state: ModbusErrorStates, date: Date = new Date()) {
    let c = this.cache.get(queueEntry.slaveId)
    if (this.cache.get(queueEntry.slaveId) == undefined) this.cache.set(queueEntry.slaveId, this.createEmptyIModbusValues())
    c = this.cache.get(queueEntry.slaveId)
    c?.errors.push(new ModbusErrorDescription(queueEntry, state, date))
  }
  private compareEntities(a: IQueueEntry, b: IQueueEntry):number{
    return  a.options.task - b.options.task
  }

  override run() {
    if (!this.isRunning && this.queue.getLength() > 0) {
      this.isRunning = true
      let processing = this.queue.getEntries()
      this.queue.clear()
      processing.sort(this.compareEntities)
      // process all queue entries sequentially:
      processing
        .reduce<Promise<void>>(
          (promise, current): Promise<void> => {
            return new Promise<void>((resolve, reject) => {
              promise.then(() => {
                if (current.address.write)
                  return this.functionCodeWriteMap.get(current.address.registerType)!(
                    current.slaveId,
                    current.address.address,
                    current.address.write
                  )
                    .then(() => {
                      resolve()
                    })
                    .catch((e) => {
                      current.onError(current, e)
                      resolve()
                    })
                else
                  return this.executeModbusFunctionCodeRead(current).then(() => {
                    resolve()
                  }).catch(e=>{
                    log.log(LogLevelEnum.error, "Unexpected catch in ModbusRTUWorker")
                  })
              }).catch(reject)
            })
          },
          new Promise<void>((resolve) => {
            resolve()
          })
        )
        .then(() => {
          if (this.queue.getLength() == 0) {
            this.isRunning = false
            this.onFinish()
          } else {
            this.isRunning = false
            this.run()
          }
        }).catch(e=>{
            log.log(LogLevelEnum.error, "Modbus RTU worker: " + e.message)
            this.isRunning = false
        })
    }
  }
  onFinish() {}
  getErrors(slaveid: number): ImodbusErrorsForSlave[] {
    let cache = this.cache.get(slaveid)
    let rc: ImodbusErrorsForSlave[] = []
    cache?.errors
    if (cache) {
      return cache.errors.map((d) => {
        return d.getModbusErorForSlave()
      })
    }
    return []
  }
}
