import { expect } from '@jest/globals'
import { IModbusResultWithDuration } from '../src/bus'
import { ModbusRTUQueue } from '../src/ModbusRTUQueue'
import { ModbusRTUWorker } from '../src/ModbusRTUWorker'
import { IModbusAPI } from '../src/ModbusWorker'
let data = 198
export class FakeBus implements IModbusAPI {
  reconnected: boolean = false
  wroteDataCount: number = 0
  callCount: number = 0
  constructor() {
    data = 198
  }
  getCacheId(): number {
    return 1;
  }
  reconnectRTU(task: string) {
    return new Promise<void>((resolve) => {
      this.reconnected = true
      resolve()
    })
  }
  
  writeHoldingRegisters(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wroteDataCount++
      expect(data[0]).toBeGreaterThanOrEqual(200)
      resolve()
    })
  }
  writeCoils(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('Error'))
    })
  }
  defaultRC = (resolve: (result: IModbusResultWithDuration) => void, reject: (e: any) => void) => {
    resolve({ data: [0], duration: 199 })
  }
  readHoldingRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>((resolve) => {
      let d: number[] = []
      this.callCount = 1
      for (let idx = 0; idx < length; idx++) d.push(dataaddress)
      data++
      resolve({ data: d, duration: data })
    })
  }
  readCoils(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.callCount > 0) {
        this.callCount = 0
        let r: IModbusResultWithDuration = {
          data: [1],
          duration: 100,
        }
        resolve(r)
      } else {
        this.callCount = 1
        switch (dataaddress) {
          case 197:
            {
              this.callCount = 1
              let e1: any = new Error('Error')
              e1.modbusCode = 1 // Illegal function address
              reject(e1)
            }
            break
          case 198:
            {
              let e1: any = new Error('Error')
              e1.modbusCode = 1 // Illegal function code
              reject(e1)
            }
            break
          case 199:
            let e1: any = new Error('CRC error')
            reject(e1)
            break
          case 202:
            let e2: any = new Error('CRC error')
            reject(e2)
            break
          case 200:
            let e = new Error('Error')
            ;(e as any).errno = 'ETIMEDOUT'
            reject(e)
            break
          default:
            let r: IModbusResultWithDuration = {
              data: [1],
              duration: 100,
            }
            if (length > 1) for (let l = 1; l < length; l++) r.data.push(1)
            resolve(r)
        }
      }
    })
  }
  readDiscreteInputs(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>(this.defaultRC)
  }
  readInputRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>(this.defaultRC)
  }
}
export class ModbusRTUWorkerForTest extends ModbusRTUWorker {
  public isRunningForTest: boolean
  public expectedReconnected: boolean = false
  public expectedAPIcallCount: number = 1
  public expectedAPIwroteDataCount: number = 0
  constructor(
    modbusAPI: IModbusAPI,
    queue: ModbusRTUQueue,
    private done: () => void,
    private testcase: string
  ) {
    super(modbusAPI, queue)
    this.isRunningForTest = false
  }
  override onFinish(): void {
    let fakeBus: FakeBus = this.modbusAPI as any
    expect(fakeBus.callCount).toBe(this.expectedAPIcallCount)
    expect((this.modbusAPI as FakeBus).reconnected).toBe(this.expectedReconnected)
    expect(fakeBus.wroteDataCount).toBe(this.expectedAPIwroteDataCount)
    this.done()
  }
}
export interface Itest {
  worker?: ModbusRTUWorkerForTest
}
