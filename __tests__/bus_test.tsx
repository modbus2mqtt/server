import Debug from 'debug'
import { expect, it, describe, beforeAll, jest } from '@jest/globals'
import { Config } from '../src/config'
import { Bus } from '../src/bus'
import { initBussesForTest, yamlDir } from './configsbase'
import { ModbusServer, XYslaveid } from './../src/modbusTCPserver'
import { IdentifiedStates, ImodbusEntity, ImodbusSpecification } from '@modbus2mqtt/specification.shared'
import {
  ConfigSpecification,
  emptyModbusValues,
  IModbusResultOrError,
  ImodbusValues,
  LogLevelEnum,
} from '@modbus2mqtt/specification'
import { singleMutex } from './configsbase'
import { Iconfiguration, PollModes } from '@modbus2mqtt/server.shared'
import { ConfigBus } from '../src/configbus'

const debug = Debug('bustest')
const testPort = 8888
Config['yamlDir'] = yamlDir
ConfigSpecification.yamlDir = yamlDir
Config['sslDir'] = yamlDir

beforeAll(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
  initBussesForTest()
  Config['yamlDir'] = yamlDir
  new ConfigSpecification().readYaml()
  return new Promise<void>((resolve, reject) => {
    new Config()
      .readYamlAsync()
      .then(() => {
        resolve()
      })
      .catch(reject)
  })
})

it('read slaves/delete slave/addSlave/read slave', () => {
  let bus = Bus.getBus(0)
  expect(bus).toBeDefined()
  if (bus) {
    bus.deleteSlave(10)
    let slaves = bus.getSlaves()
    let oldLength = slaves.length
    expect(bus.getSlaves().find((s) => s.slaveid == 10)).not.toBeDefined()
    bus.writeSlave({ slaveid: 10 })
    slaves = bus.getSlaves()
    expect(slaves.length).toBeGreaterThan(oldLength)
    let b2 = Bus.getBus(0)
    if (b2) debug(b2?.properties.slaves.length.toString())
    bus.deleteSlave(10)
    b2 = Bus.getBus(0)
    if (b2) debug(b2?.properties.slaves.length)
    expect(slaves.length).toEqual(oldLength)
  }
})
// it('getAvailableModusData with empty busses array', (done) => {
//    Config['yamlDir'] = "emptyYaml";

//    new Config().readYaml();

//    Bus.getAllAvailableModusData().subscribe(() => {

//       done();
//    })
// })

function testRead(
  address: number,
  address2: number,
  value1: number,
  value2: number,
  fc: (slaveid: number, address: number, length: any) => Promise<IModbusResultOrError>
): Promise<void> {
  return new Promise<void>((resolve) => {
    let tcpServer = new ModbusServer()
    let bus = Bus.getBus(1)
    if (bus) {
      tcpServer.startServer((bus.properties.connectionData as any)['port']).then(() => {
        debug('Connected to TCP server')
        bus!.connectRTU('test').then(() => {
          fc.bind(bus)(XYslaveid, address, 2)
            .then((value) => {
              expect(value!.data![0]).toBe(value1)
              expect(value!.data![1]).toBe(value2)
              fc.bind(bus)(XYslaveid, address2, 2)
                .then((_value) => {
                  expect(true).toBeFalsy()
                })
                .catch((e) => {
                  expect(e.modbusCode).toBe(2)
                  bus!.closeRTU('test', () => {
                    tcpServer.stopServer(resolve)
                  })
                })
            })
            .catch((e) => {
              console.error(e)
              bus!.closeRTU('test', () => {
                tcpServer.stopServer(resolve)
              })
            })
        })
      })
    }
  })
}
function testWrite(
  address: number,
  address2: number,
  value: number,
  fc: (slaveid: number, address: number, length: any) => Promise<void>
): Promise<void> {
  return new Promise<void>((resolve) => {
    let tcpServer = new ModbusServer()
    let bus = Bus.getBus(1)
    if (bus) {
      tcpServer.startServer((bus.properties.connectionData as any)['port']).then(() => {
        let bus = Bus.getBus(1)
        if (bus)
          bus.connectRTU('test').then(() => {
            fc.bind(bus)(XYslaveid, address, { data: [value], buffer: [0] })
              .then(() => {
                fc.bind(bus)(XYslaveid, address2, {
                  data: [value],
                  buffer: [0],
                })
                  .then(() => {
                    expect(true).toBeFalsy()
                  })
                  .catch((e) => {
                    expect(e.modbusCode).toBe(2)
                    bus!.closeRTU('test', () => {
                      tcpServer.stopServer(resolve)
                    })
                  })
              })
              .catch((e) => {
                bus!.closeRTU('test', () => {
                  tcpServer.stopServer(resolve)
                })
              })
          })
      })
    }
  })
}
var readConfig = new Config()
var prepared: boolean = false
function prepareIdentification() {
  if (!prepared) {
    prepared = true
    new ConfigSpecification().readYaml()
    readConfig = new Config()
    readConfig.readYaml()
  }
}
function readModbusRegisterFake(): Promise<ImodbusValues> {
  return new Promise<ImodbusValues>((resolve, reject) => {
    let ev = emptyModbusValues()
    ev.holdingRegisters.set(3, { data: [40] })
    ev.holdingRegisters.set(4, { data: [40] })
    ev.holdingRegisters.set(5, { data: [2] })
    resolve(ev)
  })
}
it('Bus getSpecsForDevice', (done) => {
  prepareIdentification()
  if (Config.getConfiguration().fakeModbus) debug(LogLevelEnum.notice, 'Fakemodbus')
  let bus = Bus.getBus(0)
  expect(bus).toBeDefined()
  bus!.readModbusRegister = readModbusRegisterFake
  bus!
    .getAvailableSpecs(1, false, 'en')
    .then((ispec) => {
      let wlt = false
      let other = 0
      let unknown = 0
      expect(ispec).toBeDefined()

      ispec.forEach((spec) => {
        if (spec!.filename === 'waterleveltransmitter') {
          wlt = true
          expect(spec!.identified).toBe(IdentifiedStates.identified)
        } else if (spec.identified == IdentifiedStates.unknown) {
          unknown++
        } else {
          other++
          expect(spec!.identified).toBe(IdentifiedStates.notIdentified)
        }
      })
      expect(unknown).toBe(3)
      expect(other).toBeGreaterThan(0)
      expect(wlt).toBeTruthy()
      done()
    })
    .catch((e) => {
      debug(e.message)
    })
})

it('Modbus getAvailableSpecs with specific slaveId no results 0-3', (done) => {
  prepareIdentification()
  Config['config'].fakeModbus = true
  if (Config.getConfiguration().fakeModbus) debug('Fakemodbus')
  Bus.getBus(0)!
    .getAvailableSpecs(1, false, 'en')
    .then((ispec) => {
      expect(ispec).toBeDefined()
      expect(ispec.length).toBeGreaterThan(0)
      done()
      Config['config'].fakeModbus = true
    })
})
describe('ServerTCP based', () => {
  it('read Discrete Inputs success, Illegal Address', (done) => {
    singleMutex.runExclusive(() => {
      testRead(1, 4, 1, 1, Bus.prototype.readDiscreteInputs).then(() => {
        done()
      })
    })
  })
  it('read HoldingRegisters success, Illegal Address', (done) => {
    singleMutex.runExclusive(() => {
      testRead(0x0101, 0x0109, 1, 1, Bus.prototype.readHoldingRegisters).then(() => {
        debug('done')
        done()
      })
    })
  })
  it('read readInputRegisters success, Illegal Address', (done) => {
    singleMutex.runExclusive(() => {
      testRead(1, 2, 195, 500, Bus.prototype.readInputRegisters).then(() => {
        done()
      })
    })
  })
  it('writeHoldingRegisters success, Illegal Address', (done) => {
    singleMutex.runExclusive(() => {
      testWrite(1, 2, 10, Bus.prototype.writeHoldingRegisters).then(() => {
        done()
      })
    })
  })
  it('writeCoils success, Illegal Address', (done) => {
    singleMutex.runExclusive(() => {
      testWrite(1, 4, 0, Bus.prototype.writeCoils).then(() => {
        done()
      })
    })
  })

  let specNoError: ImodbusSpecification = {
    entities: [{ id: 1, identified: IdentifiedStates.identified } as ImodbusEntity],
    identified: IdentifiedStates.identified,
  } as ImodbusSpecification
})
