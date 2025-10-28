import { FCallbackVal, IServiceVector, ServerTCP } from 'modbus-serial'
import Debug from 'debug'
import { ModbusRegisterType } from '../specification.shared'
import { ConfigSpecification, IfileSpecification, LogLevelEnum, Logger, M2mGitHub, Migrator } from '../specification'
import { IModbusConnection, ITCPConnection } from '../server.shared'
import { VERSION } from 'ts-node'
import * as fs from 'fs'
import { join } from 'path'
import { parse } from 'yaml'

export const XYslaveid = 1
export const Dimplexslaveid = 2
export const Eastronslaveid = 3
const log = new Logger('modbusTCP')
const debug = Debug('modbusTCP')
const dimplexHolding = [
  [1, 200],
  [1, 200],
  [174, 450],
  [11, 208],
  [3, 480],
  [46, 209],
  [47, 30],
]

const values = {
  //XY-MD02
  inputRegisters: [
    { slaveid: XYslaveid, address: 1, value: 195 },
    { slaveid: XYslaveid, address: 2, value: 500 },
  ],
  holdingRegisters: [
    { slaveid: XYslaveid, address: 0x0101, value: 1 },
    { slaveid: XYslaveid, address: 0x0102, value: 1 },
  ],
  coils: [
    { slaveid: XYslaveid, address: 1, value: true },
    { slaveid: XYslaveid, address: 2, value: true },
    { slaveid: Dimplexslaveid, address: 1, value: false },
    { slaveid: Dimplexslaveid, address: 3, value: false },
  ],
}

function getCoil(addr: number, unitID: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let v = values.coils.find((v) => v.slaveid == unitID && v.address == addr)
    if (v) {
      debug('getCoil: slave: ' + unitID + 'address: ' + addr + 'v: ' + v.value)
      resolve(v.value)
    } else {
      debug('getCoil: failed slave: ' + unitID + 'address: ' + addr)

      reject({ modbusErrorCode: 2, msg: '' })
    }
  })
}
const vector: IServiceVector = {
  getInputRegister: function (addr: number, unitID: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let v = values.inputRegisters.find((v) => v.slaveid == unitID && v.address == addr)
      if (v) {
        debug('getInputRegister slave:' + addr + 'unit' + unitID + 'v: ' + v.value)
        resolve(v.value)
      } else {
        debug('getInputRegister slave:' + addr + 'unit' + unitID)
        reject({ modbusErrorCode: 2, msg: '' })
      }
    })
  },
  getHoldingRegister: function (addr: number, unitID: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let v = values.holdingRegisters.find((v) => v.slaveid == unitID && v.address == addr)
      if (v) {
        debug('getHoldingRegister addr:' + addr + ' slave: ' + unitID + 'v: ' + v.value)
        resolve(v.value)
      } else {
        debug('getHoldingRegister not found addr:' + addr + ' slave: ' + unitID)
        reject({ modbusErrorCode: 2, msg: '' })
      }
    })
  },
  getMultipleInputRegisters: (addr: number, length: number, unitID: number, cb: FCallbackVal<number[]>): void => {
    let rc: number[] = []
    for (let idx = 0; idx < length; idx++) {
      let v = values.inputRegisters.find((v) => v.slaveid == unitID && v.address == addr + idx)
      if (v) rc.push(v.value)
      else {
        debug('getMultipleInputRegisters not found addr:' + addr + ' slave: ' + unitID)
        cb({ modbusErrorCode: 2 } as any as Error, [])
        return
      }
    }
    debug('getMultipleInputRegisters addr:' + addr + ' slave: ' + unitID + 'rc: ' + JSON.stringify(rc))
    cb(null, rc)
  },
  getMultipleHoldingRegisters: (addr: number, length: number, unitID: number, cb: FCallbackVal<number[]>): void => {
    let rc: number[] = []
    for (let idx = 0; idx < length; idx++) {
      let v = values.holdingRegisters.find((v) => v.slaveid == unitID && v.address == addr + idx)
      if (v) rc.push(v.value)
      else {
        log.log(LogLevelEnum.notice, 'Invalid holding reg s:' + unitID + ' a: ' + addr + idx)
        cb({ modbusErrorCode: 2 } as any as Error, [])
        return
      }
    }
    debug('getMultipleHoldingRegisters ' + JSON.stringify(rc))
    cb(null, rc)
  },
  getDiscreteInput: getCoil,
  getCoil: getCoil,

  setRegister: (addr: number, value: number, unitID: number): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      let v = values.holdingRegisters.find((v) => v.slaveid == unitID && v.address == addr)
      if (v) {
        v.value = value
        resolve()
      } else reject({ modbusErrorCode: 2, msg: '' })
    })
  },
  setCoil: (addr: number, value: boolean, unitID: number, cb: FCallbackVal<number>): void => {
    let v = values.coils.find((v) => v.slaveid == unitID && v.address == addr)
    if (v) {
      v.value = value
      cb(null, value ? 1 : 0)
    } else {
      cb({ modbusErrorCode: 2 } as any as Error, 0)
      return
    }
  },
}
export class ModbusServer {
  serverTCP: ServerTCP | undefined
  startServerForTest(port: number) {
    dimplexHolding.forEach((nv) => {
      values.holdingRegisters.push({
        slaveid: Dimplexslaveid,
        address: nv[0],
        value: nv[1],
      })
    })
  }

  async startServer(port: number): Promise<ServerTCP> {
    let rc = new Promise<ServerTCP>((resolve, reject) => {
      this.serverTCP = new ServerTCP(vector, {
        host: '0.0.0.0',
        port: port,
        debug: true,
      })

      this.serverTCP.on('socketError', function (err) {
        // Handle socket error if needed, can be ignored
        reject(err)
      })
      this.serverTCP.on('serverError', function (err) {
        // Handle socket error if needed, can be ignored
        reject(err)
      })
      this.serverTCP.on('error', function (err) {
        // Handle socket error if needed, can be ignored
        reject(err)
      })
      this.serverTCP.on('initialized', () => {
        log.log(LogLevelEnum.notice, 'ModbusTCP listening on modbus://0.0.0.0:' + port)
        resolve(this.serverTCP!)
      })
    })
    return rc
  }
  stopServer(cb?: () => void) {
    if (this.serverTCP)
      this.serverTCP.close(() => {
        if (cb) cb()
      })
  }
}
export function clearRegisterValues() {
  values.holdingRegisters = []
  values.inputRegisters = []
  values.coils = []
}
export function addRegisterValue(slaveid: number, address: number, fc: ModbusRegisterType, value: number): void {
  switch (fc) {
    case ModbusRegisterType.HoldingRegister:
      values.holdingRegisters.push({
        slaveid: slaveid,
        address: address,
        value: value,
      })
      break

    case ModbusRegisterType.Coils:
      values.coils.push({
        slaveid: slaveid,
        address: address,
        value: value != 0,
      })
      break
    case ModbusRegisterType.AnalogInputs:
      values.inputRegisters.push({
        slaveid: slaveid,
        address: address,
        value: value,
      })
      break
    default:
      log.log(LogLevelEnum.notice, 'Invalid function code ' + fc)
  }
}
export function logValues() {
  log.log(LogLevelEnum.notice, 'coils')
  values.coils.forEach((c) => {
    log.log(LogLevelEnum.notice, 's: ' + c.slaveid + ' a: ' + c.address + ' v: ' + c.value)
  })
  log.log(LogLevelEnum.notice, 'holding')
  values.holdingRegisters.forEach((c) => {
    log.log(LogLevelEnum.notice, 's: ' + c.slaveid + ' a: ' + c.address + ' v: ' + c.value)
  })
  log.log(LogLevelEnum.notice, 'input')
  values.inputRegisters.forEach((c) => {
    log.log(LogLevelEnum.notice, 's: ' + c.slaveid + ' a: ' + c.address + ' v: ' + c.value)
  })
}
let server: ModbusServer | undefined = undefined
export function runModbusServer(port: number = 8502): void {
  server = new ModbusServer()
  server
    .startServer(port)
    .then(() => {
      log.log(LogLevelEnum.notice, 'listening')
    })
    .catch((e) => {
      log.log(LogLevelEnum.error, 'Unable to start ' + e.message)
      process.exit(1)
    })
}
process.on('SIGINT', () => {
  stopModbusTCPServer()
})

export function stopModbusTCPServer() {
  if (server) server.stopServer()
}
export function startModbusTCPserver(configDir: string,dataDir:string, busId: number) {
  debug('starting')
  if (process.pid) log.log(LogLevelEnum.notice, 'PROCESSID=' + process.pid)
  let gh = new M2mGitHub(null, ConfigSpecification.getPublicDir())
  gh.init()
    .then(() => {
      let port = 502
      clearRegisterValues()
      let directoryBus = ConfigSpecification.getLocalDir() + '/busses/bus.' + busId
      let directoryPublicSpecs = ConfigSpecification.getPublicDir() + '/specifications'
      let directoryLocalSpecs = ConfigSpecification.getLocalDir() + '/specifications'
      if (!fs.existsSync(directoryBus)) {
        log.log(LogLevelEnum.error, 'Unable to start TCP server: Bus directory not found ' + directoryBus)
        return
      }
      let files = fs.readdirSync(directoryBus)
      files.forEach((slaveFileName) => {
        if (slaveFileName == 'bus.yaml') {
          let content = fs.readFileSync(join(directoryBus, slaveFileName), {
            encoding: 'utf8',
          })
          let connection: IModbusConnection = parse(content.toString())
          port = (connection as ITCPConnection).port
        }

        if (slaveFileName.startsWith('s'))
          try {
            let content = fs.readFileSync(join(directoryBus, slaveFileName), {
              encoding: 'utf8',
            })
            let slave = parse(content.toString())
            let slaveid = slave.slaveid
            let specFilename = slave.specificationid
            if (specFilename) {
              let fn = join(directoryLocalSpecs, specFilename + '.yaml')
              if (!fs.existsSync(fn)) fn = join(directoryPublicSpecs, specFilename + '.yaml')
              if (!fs.existsSync(fn)) console.log('TCP Server: Spec file not found: ' + fn)
              else {
                content = fs.readFileSync(fn, { encoding: 'utf8' })
                let spec: IfileSpecification = parse(content.toString())
                spec = new Migrator().migrate(spec)
                if (spec.testdata) {
                  let testdata = spec.testdata
                  if (spec.testdata.analogInputs)
                    spec.testdata.analogInputs.forEach((avp) => {
                      let a = avp.address
                      if (avp.value != undefined) addRegisterValue(slaveid, a, ModbusRegisterType.AnalogInputs, avp.value)
                    })
                  if (spec.testdata.holdingRegisters)
                    spec.testdata.holdingRegisters.forEach((avp) => {
                      let a = avp.address
                      if (avp.value != undefined) addRegisterValue(slaveid, a, ModbusRegisterType.HoldingRegister, avp.value)
                    })
                  if (spec.testdata.coils)
                    spec.testdata.coils.forEach((avp) => {
                      let a = avp.address
                      if (avp.value != undefined) addRegisterValue(slaveid, a, ModbusRegisterType.Coils, avp.value)
                    })
                }
              }
            }
            //  logValues()
          } catch (e: any) {
            console.error('Unable to read  directory for ' + e)
          }
      })
      runModbusServer(port)
    })
    .catch((e: any) => {
      log.log(LogLevelEnum.error, 'Failed to init github: ' + e.message)
    })
}

// set the server to answer for modbus requests
