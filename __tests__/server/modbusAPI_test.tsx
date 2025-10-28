import Debug from 'debug'
import { expect, it, describe, beforeAll, jest } from '@jest/globals'
import { Config } from '../../src/server/config'
import { Bus } from '../../src/server/bus'
import { initBussesForTest, setConfigsDirsForTest } from './configsbase'
import { ModbusServer, XYslaveid } from '../../src/server/modbusTCPserver'
import { IdentifiedStates, ImodbusEntity, ImodbusSpecification } from '../../src/specification.shared'
import {
  ConfigSpecification,
  emptyModbusValues,
  IModbusResultOrError,
  ImodbusValues,
  LogLevelEnum,
} from '../../src/specification'
import { singleMutex } from './configsbase'
import { ModbusAPI } from '../../src/server/modbusAPI'

const debug = Debug('bustest')
const testPort = 8888
setConfigsDirsForTest()


beforeAll(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
  initBussesForTest()
  setConfigsDirsForTest()
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
        let modbusAPI = new ModbusAPI(bus!)
        modbusAPI.initialConnect().then(() => {
          fc.bind(modbusAPI)(XYslaveid, address, 2)
            .then((value) => {
              expect(value!.data![0]).toBe(value1)
              expect(value!.data![1]).toBe(value2)
              fc.bind(modbusAPI)(XYslaveid, address2, 2)
                .then((_value) => {
                  expect(true).toBeFalsy()
                })
                .catch((e) => {
                  expect(e.modbusCode).toBe(2)
                  modbusAPI['closeRTU']('test', () => {
                    tcpServer.stopServer(resolve)
                  })
                })
            })
            .catch((e) => {
              console.error(e)
              ;(bus!.getModbusAPI as any as ModbusAPI)['closeRTU']('test', () => {
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
        let modbusAPI = new ModbusAPI(bus!)
        modbusAPI.initialConnect().then(() => {
          fc.bind(modbusAPI)(XYslaveid, address, { data: [value], buffer: [0] })
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
                  modbusAPI['closeRTU']('test', () => {
                    tcpServer.stopServer(resolve)
                  })
                })
            })
            .catch((e) => {
              modbusAPI['closeRTU']('test', () => {
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
  let modbusAPI = bus?.getModbusAPI() as any as ModbusAPI
  expect(bus).toBeDefined()
  modbusAPI!.readModbusRegister = readModbusRegisterFake
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
      testRead(1, 4, 1, 1, ModbusAPI.prototype.readDiscreteInputs).then(() => {
        done()
      })
    })
  })
  it('read HoldingRegisters success, Illegal Address', (done) => {
    singleMutex.runExclusive(() => {
      testRead(0x0101, 0x0109, 1, 1, ModbusAPI.prototype.readHoldingRegisters).then(() => {
        debug('done')
        done()
      })
    })
  })
  it('read readInputRegisters success, Illegal Address', (done) => {
    singleMutex.runExclusive(() => {
      testRead(1, 2, 195, 500, ModbusAPI.prototype.readInputRegisters).then(() => {
        done()
      })
    })
  })
  it('writeHoldingRegisters success, Illegal Address', (done) => {
    singleMutex.runExclusive(() => {
      testWrite(1, 2, 10, ModbusAPI.prototype.writeHoldingRegisters).then(() => {
        done()
      })
    })
  })
  it('writeCoils success, Illegal Address', (done) => {
    singleMutex.runExclusive(() => {
      testWrite(1, 4, 0, ModbusAPI.prototype.writeCoils).then(() => {
        done()
      })
    })
  })

  let specNoError: ImodbusSpecification = {
    entities: [{ id: 1, identified: IdentifiedStates.identified } as ImodbusEntity],
    identified: IdentifiedStates.identified,
  } as ImodbusSpecification
})
