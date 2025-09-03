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
import { ModbusAPI } from '../src/ModbusAPI'

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
  bus!['modbusAPI'] = new ModbusAPI(bus!)
  bus!['modbusAPI'].readModbusRegister = readModbusRegisterFake
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
