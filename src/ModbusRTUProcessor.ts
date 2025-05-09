import { ImodbusValues, IModbusResultOrError, LogLevelEnum } from '@modbus2mqtt/specification'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { IQueueOptions, ModbusRTUQueue } from './ModbusRTUQueue'
import { Logger } from '@modbus2mqtt/specification'
import Debug from 'debug'
import { ImodbusAddress, ModbusTasks } from '@modbus2mqtt/server.shared'

const debug = Debug('modbusrtuprocessor')
const debugLog = Debug('modbusrtuprocessor.log')
const log = new Logger('modbusrtuprocessor')

const maxAddressDelta = 10
const logNoticeMaxWaitTime = 1000 * 60 * 30 // 30 minutes

export interface IexecuteOptions extends IQueueOptions {
  printLogs?: boolean
  errorHandling: {
    split?: boolean
    retry?: boolean
  }
}
interface ImodbusAddressesWithSlave {
  slave: number
  addresses: ImodbusAddress[]
}

export class ModbusRTUProcessor {
  private static lastNoticeMessageTime: number
  private static lastNoticeMessage: string

  constructor(private queue: ModbusRTUQueue) {}
  private prepare(slaveId: number, addresses: Set<ImodbusAddress>): ImodbusAddressesWithSlave {
    let preparedAddresses: ImodbusAddress[] = []

    let previousAddress = {
      address: -1,
      registerType: ModbusRegisterType.IllegalFunctionCode,
    }
    let startAddress = {
      address: -1,
      registerType: ModbusRegisterType.IllegalFunctionCode,
    }
    let sortedAddresses = Array.from<ImodbusAddress>(addresses.values()).sort(function (a, b) {
      let v = a.registerType - b.registerType
      if (v) return v
      return a.address - b.address
    })
    for (let addr of sortedAddresses) {
      if (previousAddress.address == -1) previousAddress = addr
      if (startAddress.address == -1) startAddress = addr
      if (addr.registerType != previousAddress.registerType || addr.address - previousAddress.address > maxAddressDelta) {
        preparedAddresses.push({
          address: startAddress.address,
          length: previousAddress.address - startAddress.address + 1,
          registerType: previousAddress.registerType,
        })
        previousAddress = addr
        startAddress = addr
      } else previousAddress = addr
    }
    if (startAddress.address >= 0)
      preparedAddresses.push({
        address: startAddress.address,
        length: previousAddress.address - startAddress.address + 1,
        registerType: previousAddress.registerType,
      })
    return { slave: slaveId, addresses: preparedAddresses }
  }
  private logNotice(msg: string, options?: IexecuteOptions) {
    if (options == undefined || !options.printLogs) {
      debugLog(msg)
      return
    }
    // suppress similar duplicate messages
    let repeatMessage =
      ModbusRTUProcessor.lastNoticeMessageTime != undefined &&
      ModbusRTUProcessor.lastNoticeMessageTime + logNoticeMaxWaitTime < Date.now()
    if (repeatMessage || msg != ModbusRTUProcessor.lastNoticeMessage) {
      ModbusRTUProcessor.lastNoticeMessage = msg
      ModbusRTUProcessor.lastNoticeMessageTime = Date.now()
      log.log(LogLevelEnum.notice, options.task ? options.task + ' ' : '' + msg)
    }
  }

  private countResults(results: ImodbusValues): number {
    let properties = Object.getOwnPropertyNames(results)
    let size: number = results.analogInputs.size
    size += results.coils.size
    size += results.discreteInputs.size
    return size + results.holdingRegisters.size
  }
  private countAddresses(addresses: ImodbusAddress[]): number {
    let size: number = 0
    addresses.forEach((address) => {
      size += address.length != undefined ? address.length : 1
    })
    return size
  }
  private getTask(options: IexecuteOptions): ModbusTasks {
    return options.task
  }
  execute(slaveId: number, addresses: Set<ImodbusAddress>, options: IexecuteOptions): Promise<ImodbusValues> {
    return new Promise<ImodbusValues>((resolve) => {
      let preparedAddresses = this.prepare(slaveId, addresses)

      debug(ModbusTasks[options.task] + ': slaveId: ' + slaveId + '=====================')
      for (let a of preparedAddresses.addresses) {
        debug(a.registerType + ':' + a.address + '(' + (a.length ? a.length : 1) + ')')
      }
      debug('=====================')

      let addressCount = this.countAddresses(preparedAddresses.addresses)
      let values: ImodbusValues = {
        holdingRegisters: new Map<number, IModbusResultOrError>(),
        analogInputs: new Map<number, IModbusResultOrError>(),
        coils: new Map<number, IModbusResultOrError>(),
        discreteInputs: new Map<number, IModbusResultOrError>(),
      }
      let resultMaps = new Map<ModbusRegisterType, Map<number, IModbusResultOrError>>()
      resultMaps.set(ModbusRegisterType.AnalogInputs, values.analogInputs)
      resultMaps.set(ModbusRegisterType.HoldingRegister, values.holdingRegisters)
      resultMaps.set(ModbusRegisterType.Coils, values.coils)
      resultMaps.set(ModbusRegisterType.DiscreteInputs, values.discreteInputs)
      let resultCount = 0
      preparedAddresses.addresses.forEach((address) => {
        this.queue.enqueue(
          preparedAddresses.slave,
          address,
          (queueEntry, data) => {
            if (data == undefined || undefined != queueEntry.address.write)
              throw new Error(
                'Only read results expected for slave: ' +
                  slaveId +
                  ' function code: ' +
                  queueEntry.address.registerType +
                  ' address: ' +
                  queueEntry.address.address
              )
            resultCount++
            if (queueEntry.address.length != undefined)
              for (let idx = 0; idx < queueEntry.address.length; idx++) {
                let r: IModbusResultOrError = structuredClone({
                  data: [data[idx]],
                })
                resultMaps.get(queueEntry.address.registerType)!.set(queueEntry.address.address + idx, r)
              }
            else resultMaps.get(queueEntry.address.registerType)!.set(queueEntry.address.address, { data: data })
            let valueCount = this.countResults(values)
            debug(
              ModbusTasks[options.task] +
                ': ' +
                slaveId +
                '/' +
                valueCount +
                '/' +
                addressCount +
                ') startaddress: ' +
                queueEntry.address.address +
                '(' +
                (queueEntry.address.length ? queueEntry.address.length : 1) +
                ')' +
                ': ' +
                data[0]
            )
            if (valueCount == addressCount) {
              debug(ModbusTasks[options.task] + ': slaveId: ' + slaveId + ' addresses.length:' + preparedAddresses.addresses.length)
              resolve(values)
            }
          },
          (currentEntry, error) => {
            let r: IModbusResultOrError = { error: error }

            let id =
              ModbusTasks[options.task] +
              'slave: ' +
              currentEntry.slaveId +
              ' Reg: ' +
              currentEntry.address.registerType +
              ' Address: ' +
              currentEntry.address.address +
              ' (l: ' +
              (currentEntry.address.length ? currentEntry.address.length : 1) +
              ')'

            debug(id + ': Failure not handled: ' + error.message)
            // error is not handled by the error handler
            resultCount++

            if (currentEntry.address.length != undefined)
              for (let idx = 0; idx < currentEntry.address.length; idx++)
                resultMaps.get(currentEntry.address.registerType)!.set(currentEntry.address.address + idx, r)
            else resultMaps.get(currentEntry.address.registerType)!.set(currentEntry.address.address, r)

            let valueCount = this.countResults(values)
            if (valueCount == addressCount) {
              debug('Finished ' + id)
              resolve(values)
            }
          },
          options
        )
      })
    })
  }
}
