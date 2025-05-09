import { it, expect } from '@jest/globals'
import { ModbusTcpRtuBridge } from '../src/tcprtubridge'
import { ModbusRTUQueue } from '../src/ModbusRTUQueue'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { FakeBus, ModbusRTUWorkerForTest } from './testhelper'
import ModbusRTU from 'modbus-serial'
import exp from 'constants'

it('getCoil', () => {
  let queue = new ModbusRTUQueue()
  let bridge = new ModbusTcpRtuBridge(queue)
  ;(bridge['vector']!.getCoil as (addr: number, unitID: number) => Promise<boolean>)(1, 2)
  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(1)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.Coils)
})
it('getDiscreteInput', () => {
  let queue = new ModbusRTUQueue()
  let bridge = new ModbusTcpRtuBridge(queue)
  ;(bridge['vector']!.getDiscreteInput as (addr: number, unitID: number) => Promise<boolean>)(1, 2)
  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(1)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.DiscreteInputs)
})
it('setCoil', () => {
  let queue = new ModbusRTUQueue()
  let bridge = new ModbusTcpRtuBridge(queue)
  ;(bridge['vector']!.setCoil as (addr: number, v: boolean, unitID: number) => Promise<boolean>)(1, true, 2)
  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(1)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.Coils)
  expect(queue.getEntries()[0].address.write).toEqual([1])
})
it('setRegister', () => {
  let queue = new ModbusRTUQueue()
  let bridge = new ModbusTcpRtuBridge(queue)
  ;(bridge['vector']!.setRegister as (addr: number, v: number, unitID: number) => Promise<boolean>)(1, 27, 2)
  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(1)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.HoldingRegister)
  expect(queue.getEntries()[0].address.write).toEqual([27])
})
it('getHoldingRegister', () => {
  let queue = new ModbusRTUQueue()
  let bridge = new ModbusTcpRtuBridge(queue)
  ;(bridge['vector']!.getHoldingRegister as (addr: number, unitID: number) => Promise<boolean>)(1, 2)
  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(1)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.HoldingRegister)
  expect(queue.getEntries()[0].address.write).not.toBeDefined()
})
it('getInputRegister', () => {
  let queue = new ModbusRTUQueue()
  let bridge = new ModbusTcpRtuBridge(queue)
  ;(bridge['vector']!.getInputRegister as (addr: number, unitID: number) => Promise<boolean>)(1, 2)
  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(1)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.AnalogInputs)
  expect(queue.getEntries()[0].address.write).not.toBeDefined()
})
it('getMultipleHoldingRegisters', () => {
  let queue = new ModbusRTUQueue()
  let bridge = new ModbusTcpRtuBridge(queue)
  ;(bridge['vector']!.getMultipleHoldingRegisters as (addr: number, length: number, unitID: number) => Promise<boolean>)(1, 3, 2)
  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(3)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.HoldingRegister)
  expect(queue.getEntries()[0].address.write).not.toBeDefined()
})
it('getMultipleInputRegisters', (done) => {
  let queue = new ModbusRTUQueue()
  let bridge = new ModbusTcpRtuBridge(queue)
  bridge['vector']!.getMultipleInputRegisters!(1, 3, 2, () => {
    done()
  })

  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(3)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.AnalogInputs)
  expect(queue.getEntries()[0].address.write).not.toBeDefined()
  queue.getEntries()[0].onResolve(queue.getEntries()[0], [198, 198, 198])
})

it('start/stop live test', (done) => {
  let queue = new ModbusRTUQueue()
  let fakeBus = new FakeBus()
  let worker = new ModbusRTUWorkerForTest(fakeBus, queue, () => {}, 'start/stop')
  worker.run()
  let bridge = new ModbusTcpRtuBridge(queue)
  const client = new ModbusRTU()

  // open connection to a tcp line
  client.setID(1)
  bridge
    .startServer(3010)
    .then(() => {
      client.connectTCP('localhost', { port: 3010 }).then(() => {
        // submit a request
        client
          .readHoldingRegisters(2, 4)
          .then((value) => {
            expect(value.data.length).toBe(4)
            bridge.stopServer(done)
          })
          .catch((e) => {
            expect(false).toBeTruthy()
          })
      })
    })
    .catch((e) => {
      expect(false).toBeTruthy()
    })
})
