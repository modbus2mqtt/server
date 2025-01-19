import { ImodbusSpecification, Ispecification } from '@modbus2mqtt/specification.shared'
import { ConfigSpecification, ConverterMap, ImodbusValues, M2mSpecification, emptyModbusValues } from '@modbus2mqtt/specification'
import { Ientity, ImodbusEntity } from '@modbus2mqtt/specification.shared'
import { Config } from './config'
import { ImodbusAddress, ModbusCache } from './modbuscache'
import { Observable, Subject } from 'rxjs'
import { Bus } from './bus'
import { submitGetHoldingRegisterRequest } from './submitRequestMock'
import { IfileSpecification } from '@modbus2mqtt/specification'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
const debug = require('debug')('modbus')
const debugAction = require('debug')('actions')

const log = new Logger('modbus')
export class Modbus {
  constructor() {}

  static writeEntityModbus(bus: Bus, slaveid: number, entity: Ientity, modbusValue: ReadRegisterResult): Promise<void> {
    // this.modbusClient.setID(device.slaveid);
    if (Config.getConfiguration().fakeModbus) {
      return new Promise<void>((resolve) => {
        debug('Fake ModbusWrite')
        resolve()
      })
    } else if (entity.modbusAddress && entity.registerType) {
      return new ModbusCache('write', true).writeRegisters(
        { busid: bus.getId(), slaveid: slaveid },
        entity.modbusAddress,
        entity.registerType,
        modbusValue
      )
    }
    throw new Error('No modbusaddress or registerType passed')
  }

  static writeEntityMqtt(bus: Bus, slaveid: number, spec: Ispecification, entityid: number, mqttValue: string): Promise<void> {
    // this.modbusClient.setID(device.slaveid);
    let entity = spec.entities.find((ent) => ent.id == entityid)
    if (Config.getConfiguration().fakeModbus) {
      return new Promise<void>((resolve) => {
        debug('Fake ModbusWrite')
        resolve()
      })
    } else if (entity) {
      let converter = ConverterMap.getConverter(entity)
      if (entity.modbusAddress !== undefined && entity.registerType && converter) {
        let modbusValue = converter?.mqtt2modbus(spec, entityid, mqttValue)
        if (modbusValue && modbusValue.data.length > 0) {
          return new ModbusCache('write', true).writeRegisters(
            { busid: bus.getId(), slaveid: slaveid },
            entity.modbusAddress,
            entity.registerType,
            modbusValue
          )
        } else throw new Error('No modbus address or function code or converter not found for entity ' + entityid + ' ')
      } else throw new Error('No modbus address or function code for entity ' + entityid + ' ')
    } else throw new Error('Entity not found in Specification entityid: ' + entityid + JSON.stringify(spec))
  }

  readEntityFromModbus(bus: Bus, slaveid: number, spec: Ispecification, entityId: number): Promise<ImodbusEntity> {
    return new Promise((resolve, reject) => {
      let entity = spec.entities.find((ent) => ent.id == entityId)
      if (entity && entity.modbusAddress && entity.registerType) {
        let converter = ConverterMap.getConverter(entity)
        if (converter) {
          let addresses = new Set<ImodbusAddress>()
          for (let i = entity.modbusAddress; i < entity.modbusAddress + converter.getModbusLength(entity); i++)
            addresses.add({ address: i, registerType: entity.registerType })

          let rcf = (results: ImodbusValues) => {
            let em = M2mSpecification.copyModbusDataToEntity(spec, entity!.id, results)
            if (em) resolve(em)
            else reject(new Error('Unable to copy ModbusData to Entity'))
          }
          if (Config.getConfiguration().fakeModbus)
            submitGetHoldingRegisterRequest({ busid: bus.getId(), slaveid: slaveid }, addresses).then(rcf).catch(reject)
          else bus.readModbusRegister('readEntity', slaveid, addresses).then(rcf).catch(reject)
        }
      } else {
        let msg = 'Bus ' + bus.properties.busId + ' has no configured Specification'
        log.log(LogLevelEnum.notice, msg)
        reject(new Error(msg))
      }
    })
  }

  /*
   * iterates over slave ids starting at slaveid = 1. If one of the holding registers 0,1,2 or 3 returns a value, the slave id is considered to have an attached device.
   * Now, the method tries to find specifications which are supported by the device.
   * So, even if a device was not recognized, but the modbus registers of all identifying entities are available, the slaveId will be considered to hava an attached device.
   * The result, contains an array of all slaveids with an attached device.
   * Additionally it contains an array of public specifications matching the modbus registers of the device plus all local specifications.
   */

  private static populateEntitiesForSpecification(
    specification: IfileSpecification,
    values: ImodbusValues,
    sub: Subject<ImodbusSpecification>
  ) {
    let mspec = M2mSpecification.fileToModbusSpecification(specification!, values)
    if (mspec) sub.next(mspec)
  }
  static getModbusSpecificationFromData(
    task: string,
    bus: Bus,
    slaveid: number,
    specification: IfileSpecification,
    sub: Subject<ImodbusSpecification>
  ): void {
    let addresses = new Set<ImodbusAddress>()
    ConfigSpecification.clearModbusData(specification)
    let info = '(' + bus.getId() + ',' + slaveid + ')'
    Bus.getModbusAddressesForSpec(specification, addresses)

    debugAction('getModbusSpecificationFromData start read from modbus')
    bus
      .readModbusRegister(task, slaveid, addresses)
      .then((values) => {
        debugAction('getModbusSpecificationFromData end read from modbus')
        Modbus.populateEntitiesForSpecification(specification!, values, sub)
      })
      .catch((e) => {
        // read modbus data failed.
        log.log(LogLevelEnum.error, 'Modbus Read ' + info + ' failed: ' + e.message)
        Modbus.populateEntitiesForSpecification(specification!, emptyModbusValues(), sub)
      })
  }
  static getModbusSpecification(
    task: string,
    bus: Bus,
    slaveid: number,
    specificationFilename: string | undefined,
    failedFunction: (e: any) => void
  ): Observable<ImodbusSpecification> {
    debugAction('getModbusSpecification starts (' + bus.getId() + ',' + slaveid + ')')
    let rc = new Subject<ImodbusSpecification>()
    if (!specificationFilename || specificationFilename.length == 0) {
      let slave = bus.getSlaveBySlaveId(slaveid)
      if (slave && slave.specificationid && slave.specificationid.length > 0) specificationFilename = slave.specificationid
    }
    if (specificationFilename) {
      let spec = ConfigSpecification.getSpecificationByFilename(specificationFilename)
      if (spec) {
        Modbus.getModbusSpecificationFromData(task, bus, slaveid, spec, rc)
      } else {
        let msg = 'No specification passed  ' + specificationFilename
        failedFunction(new Error(msg))
      }
    } else {
      let msg = 'No specification passed to  getModbusSpecification'
      debug(msg)
      failedFunction(new Error(msg))
    }
    return rc
  }
}

export class ModbusForTest extends Modbus {
  modbusDataToSpecForTest(spec: IfileSpecification): ImodbusSpecification | undefined {
    return M2mSpecification.fileToModbusSpecification(spec)
  }
}
