import { FCallbackVal, IServiceVector, ServerTCP } from 'modbus-serial'
import { IQueueEntry, ModbusRTUQueue } from './ModbusRTUQueue'
import { ImodbusAddress, ModbusTasks } from '@modbus2mqtt/server.shared'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { Logger, LogLevelEnum } from '@modbus2mqtt/specification'
const log = new Logger('tcprtubridge')

export class ModbusTcpRtuBridge {
  serverTCP: ServerTCP | undefined = undefined
  constructor(private queue: ModbusRTUQueue) {}
  queueRegister<T>(
    registerType: ModbusRegisterType,
    onResolve: (value?: number[]) => T,
    addr: number,
    write: number[] | undefined,
    unitID: number,
    length: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let a: ImodbusAddress = { address: addr, length: length, registerType: registerType, write: write }
      this.queue.enqueue(
        unitID,
        a,
        (_qe: IQueueEntry, result?: number[]) => {
          try {
            let v = onResolve(result)
            resolve(v)
          } catch (e: any) {
            reject(e)
          }
        },
        (_qe: IQueueEntry, e: any) => {
          reject(e)
        },
        { useCache: false, task: ModbusTasks.tcpBridge, errorHandling: {} }
      )
    })
  }
  queueOneRegister(registerType: ModbusRegisterType, addr: number, write: number | undefined, unitID: number): Promise<number> {
    let w: number[] | undefined = undefined
    if (write != undefined) w = [write]
    return this.queueRegister<number>(
      registerType,
      (value?: number[]): number => {
        if (value && value.length < 1) throw new Error('No value returned')
        else return value![0]
      },
      addr,
      w,
      unitID,
      1
    )
  }
  queueMultipleRegister(
    registerType: ModbusRegisterType,
    addr: number,
    length: number,
    unitID: number,
    cb: FCallbackVal<number[]>
  ): void {
    this.queueRegister<number[]>(
      registerType,
      (value?: number[]): number[] => {
        if (value == undefined) throw new Error('No value returned')
        else return value!
      },
      addr,
      undefined,
      unitID,
      length
    )
      .then((value) => {
        cb(null, value)
      })
      .catch((e) => {
        cb(e, [])
      })
  }
  queueOneBoolRegister(
    registerType: ModbusRegisterType,
    addr: number,
    write: boolean | undefined,
    unitID: number
  ): Promise<boolean> {
    let w: number[] | undefined = undefined
    if (write != undefined) w = [write ? 1 : 0]
    return this.queueRegister<boolean>(
      registerType,
      (value?: number[]): boolean => {
        if (value && value.length < 1) throw new Error('No value returned')
        else return value![0] != 0
      },
      addr,
      w,
      unitID,
      1
    )
  }
  vector: IServiceVector = {
    setRegister: this.queueOneRegister.bind(this, ModbusRegisterType.HoldingRegister),
    setCoil: this.queueOneBoolRegister.bind(this, ModbusRegisterType.Coils),
    getMultipleInputRegisters: this.queueMultipleRegister.bind(this, ModbusRegisterType.AnalogInputs),
    getMultipleHoldingRegisters: this.queueMultipleRegister.bind(this, ModbusRegisterType.HoldingRegister),

    getInputRegister: (addr: number, unit: number) => {
      this.queueOneRegister.bind(this, ModbusRegisterType.AnalogInputs)(addr, undefined, unit)
    },
    getHoldingRegister: (addr: number, unit: number) => {
      this.queueOneRegister.bind(this, ModbusRegisterType.HoldingRegister)(addr, undefined, unit)
    },
    getDiscreteInput: (addr: number, unit: number) => {
      this.queueOneBoolRegister.bind(this, ModbusRegisterType.DiscreteInputs)(addr, undefined, unit)
    },
    getCoil: (addr: number, unit: number) => {
      this.queueOneBoolRegister.bind(this, ModbusRegisterType.Coils)(addr, undefined, unit)
    },
  }
  async startServer(port: number): Promise<ServerTCP> {
    let rc = new Promise<ServerTCP>((resolve, reject) => {
      this.serverTCP = new ServerTCP(this.vector, {
        host: '0.0.0.0',
        port: port,
      })

      this.serverTCP.on('socketError', function (err: any) {
        // Handle socket error if needed, can be ignored
        log.log(LogLevelEnum.error, 'TCP bridge: socket error: ' + err!.message)
      })
      this.serverTCP.on('serverError', function (err) {
        // Handle socket error if needed, can be ignored
        log.log(LogLevelEnum.error, 'TCP bridge: server error: ' + err!.message)
      })
      this.serverTCP.on('error', function (err) {
        // Handle socket error if needed, can be ignored
        log.log(LogLevelEnum.error, 'TCP bridge: error: ' + err!.message)
      })
      this.serverTCP.on('initialized', () => {
        log.log(LogLevelEnum.notice, 'TCP bridge: listening on modbus://0.0.0.0:' + port)
        resolve(this.serverTCP!)
      })
    })
    return rc
  }
  stopServer(cb?: () => void) {
    if (this.serverTCP)
      this.serverTCP.close(() => {
        if (cb) cb()
        this.serverTCP = undefined
      })
  }
}
