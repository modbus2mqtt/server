import { jest, expect, it } from '@jest/globals'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import test from 'node:test'
import { ModbusRTUProcessor } from '../src/ModbusRTUProcessor'
import { ImodbusAddress, IQueueEntry, ModbusErrorActions, ModbusRTUQueue } from '../src/ModbusRTUQueue'
import { IReadRegisterResultOrError } from '@modbus2mqtt/specification'
function addAddresses(addresses: Set<ImodbusAddress>, registerType: ModbusRegisterType, startAddress: number, endAddress: number) {
  for (let idx = startAddress; idx < endAddress; idx++)
    addresses.add({
      address: idx,
      registerType: registerType,
    })
}
it('prepare', () => {
  let addresses = new Set<ImodbusAddress>()
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 0, 4)
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 7, 9)
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 27, 29)

  addAddresses(addresses, ModbusRegisterType.Coils, 0, 4)

  let queue = new ModbusRTUQueue()
  let modbusProcessor = new ModbusRTUProcessor(queue)
  let preparedAddresses = modbusProcessor['prepare'](1, addresses)
  expect(preparedAddresses.addresses.length).toBe(3)
  expect(preparedAddresses.addresses[0].address).toBe(0)
  expect(preparedAddresses.addresses[0].length).toBe(4)
  expect(preparedAddresses.addresses[0].registerType).toBe(ModbusRegisterType.Coils)
  expect(preparedAddresses.addresses[1].address).toBe(0)
  expect(preparedAddresses.addresses[1].length).toBe(9)
  expect(preparedAddresses.addresses[1].registerType).toBe(ModbusRegisterType.HoldingRegister)
  expect(preparedAddresses.addresses[2].address).toBe(27)
  expect(preparedAddresses.addresses[2].length).toBe(2)
  expect(preparedAddresses.addresses[2].registerType).toBe(ModbusRegisterType.HoldingRegister)
})

function prepareQueue(): IQueueEntry {
  let qe: IQueueEntry = {
    slaveId: 1,
    address: { address: 1, length: 2, registerType: ModbusRegisterType.HoldingRegister },
    onError(qe, e) {
      return ModbusErrorActions.notHandled
    },
    onResolve(result) {},
  }
  return qe
}

it('execute', (done) => {
  let addresses = new Set<ImodbusAddress>()
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 0, 4)
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 7, 9)
  addAddresses(addresses, ModbusRegisterType.Coils, 0, 4)

  let queue = new ModbusRTUQueue()
  let modbusProcessor = new ModbusRTUProcessor(queue)
  modbusProcessor.execute(1, addresses).then((result) => {
    expect(result.coils.size).toBe(4)
    result.coils.forEach((res) => {
      expect(res.error).not.toBeDefined()
      expect(res.result).toBeDefined()
    })
    expect(result.holdingRegisters.size).toBe(9)
    result.holdingRegisters.forEach((res) => {
      expect(res.error).toBeDefined()
      expect(res.result).not.toBeDefined()
    })
    done()
  })
  // Wait for queue to be ready
  setTimeout(() => {
    let length = queue.getLength()
    let entries = queue.getEntries()
    queue.clear()
    entries.forEach((qe, idx) => {
      if (qe.address.registerType == ModbusRegisterType.Coils)
        qe.onResolve({ result: { data: [1, 1, 0, 0], buffer: Buffer.allocUnsafe(8) }, duration: 199 })
      else if (qe.address.address == 0 && qe.address.length != undefined && qe.address.length > 1) {
        let e: any = new Error('Timeout')
        e.errno = 'ETIMEDOUT'
        qe.onError(qe, e)
      }
    })
  }, 100)
})
