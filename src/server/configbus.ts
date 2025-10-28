import { IBus, IModbusConnection, Islave, Slave } from '../server.shared'
import { ConfigSpecification, Logger, LogLevelEnum } from '../specification'
import { getSpecificationI18nEntityName, IdentifiedStates, IidentEntity, Ispecification } from '../specification.shared'
import { parse, stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'

import Debug from 'debug'
import { join } from 'path'
import { Config, ConfigListenerEvent } from './config'
import { SerialPort } from 'serialport/dist/serialport'
const log = new Logger('config')
const debug = Debug('configbus')

export class ConfigBus {
  private static busses: IBus[]
  private static listeners: {
    event: ConfigListenerEvent
    listener: ((arg: Slave, spec: Ispecification | undefined) => void) | ((arg: number) => void)
  }[] = []
  static addListener(event: ConfigListenerEvent, listener: ((arg: Slave) => void) | ((arg: number) => void)) {
    ConfigBus.listeners.push({ event: event, listener: listener })
  }
  private static emitSlaveEvent(event: ConfigListenerEvent, arg: Slave, spec: Ispecification | undefined) {
    //TODO arg.specification(spec)
    ConfigBus.listeners.forEach((eventListener) => {
      if (eventListener.event == event)
        (eventListener.listener as (arg: Slave) => Promise<void>)(arg)
          .then(() => {
            debug('Event listener executed')
          })
          .catch((e) => {
            log.log(LogLevelEnum.error, 'Unable to call event listener: ' + e.message)
          })
    })
  }
  private static emitBusEvent(event: ConfigListenerEvent, arg: number) {
    ConfigBus.listeners.forEach((eventListener) => {
      if (eventListener.event == event) (eventListener.listener as (arg: number) => void)(arg)
    })
  }

  static getBussesProperties(): IBus[] {
    return ConfigBus.busses
  }

  static readBusses() {
    ConfigBus.busses = []
    let busDir = Config.getLocalDir() + '/busses'
    let oneBusFound = false
    if (fs.existsSync(busDir)) {
      let busDirs: fs.Dirent[] = fs.readdirSync(busDir, {
        withFileTypes: true,
      })
      busDirs.forEach((de) => {
        if (de.isDirectory() && de.name.startsWith('bus.')) {
          let busid = Number.parseInt(de.name.substring(4))
          let busYaml = join(de.path, de.name, 'bus.yaml')
          let connectionData: IModbusConnection
          if (fs.existsSync(busYaml)) {
            var src: string = fs.readFileSync(busYaml, {
              encoding: 'utf8',
            })
            try {
              connectionData = parse(src)
              ConfigBus.busses.push({
                busId: busid,
                connectionData: connectionData,
                slaves: [],
              })
              let devFiles: string[] = fs.readdirSync(Config.getLocalDir() + '/busses/' + de.name)

              devFiles.forEach(function (file: string) {
                if (file.endsWith('.yaml') && file !== 'bus.yaml') {
                  var src: string = fs.readFileSync(Config.getLocalDir() + '/busses/' + de.name + '/' + file, {
                    encoding: 'utf8',
                  })
                  var o: Islave = parse(src)
                  if (o.specificationid && o.specificationid.length) {
                    ConfigBus.busses[ConfigBus.busses.length - 1].slaves.push(o)
                    ConfigBus.addSpecification(o)
                    ConfigBus.emitSlaveEvent(
                      ConfigListenerEvent.addSlave,
                      new Slave(busid, o, Config.getConfiguration().mqttbasetopic),
                      ConfigSpecification.getSpecificationByFilename(o.specificationid)
                    )
                  }
                }
              })
            } catch (e: any) {
              log.log(LogLevelEnum.error, 'Unable to parse bus os slave file: ' + busYaml + 'error:' + e.message)
            }
          }
        }
      })
    }
    debug('config: busses.length: ' + ConfigBus.busses.length)
  }

  getInstance(): ConfigBus {
    ConfigBus.busses = ConfigBus.busses && ConfigBus.busses.length > 0 ? ConfigBus.busses : []
    return new ConfigBus()
  }

  static addBusProperties(connection: IModbusConnection): IBus {
    let maxBusId = -1
    ConfigBus.busses.forEach((b) => {
      if (b.busId > maxBusId) maxBusId = b.busId
    })
    maxBusId++
    log.log(LogLevelEnum.notice, 'AddBusProperties: ' + maxBusId)
    let busArrayIndex =
      ConfigBus.busses.push({
        busId: maxBusId,
        connectionData: connection,
        slaves: [],
      }) - 1
    let busDir = Config.getLocalDir() + '/busses/bus.' + maxBusId
    if (!fs.existsSync(busDir)) {
      fs.mkdirSync(busDir, { recursive: true })
      debug('creating slaves path: ' + busDir)
    }
    let src = stringify(connection)
    fs.writeFileSync(join(busDir, 'bus.yaml'), src, { encoding: 'utf8' })
    return ConfigBus.busses[busArrayIndex]
  }
  static updateBusProperties(bus: IBus, connection: IModbusConnection): IBus {
    bus.connectionData = connection
    let busDir = Config.getLocalDir() + '/busses/bus.' + bus.busId
    if (!fs.existsSync(busDir)) {
      fs.mkdirSync(busDir, { recursive: true })
      debug('creating slaves path: ' + busDir)
    }
    let src = stringify(connection)
    fs.writeFileSync(join(busDir, 'bus.yaml'), src, { encoding: 'utf8' })
    return bus
  }
  static deleteBusProperties(busid: number) {
    let idx = ConfigBus.busses.findIndex((b) => b.busId == busid)
    if (idx >= 0) {
      ConfigBus.emitBusEvent(ConfigListenerEvent.deleteBus, busid)
      let busDir = Config.getLocalDir() + '/busses/bus.' + busid
      ConfigBus.busses.splice(idx, 1)
      fs.rmSync(busDir, { recursive: true })
    }
  }

  static async filterAllslaves<T>(busid: number, specFunction: <T>(slave: Islave) => Set<T> | any): Promise<Set<T>> {
    let addresses = new Set<T>()
    for (let slave of ConfigBus.busses[busid].slaves) {
      for (let addr of specFunction(slave)) addresses.add(addr)
    }
    return addresses
  }
  private static getslavePath(busid: number, slave: Islave): string {
    return Config.getLocalDir() + '/busses/bus.' + busid + '/s' + slave.slaveid + '.yaml'
  }
  static getIdentityEntities(spec: Ispecification, language?: string): IidentEntity[] {
    return spec.entities.map((se) => {
      let name: string | undefined = undefined
      if (language) {
        let n = getSpecificationI18nEntityName(spec, language, se.id)
        if (n == null) name = undefined
        else name = n
      }
      return {
        id: se.id,
        readonly: se.readonly,
        name: name,
        mqttname: se.mqttname ? se.mqttname : 'unknown',
      }
    })
  }

  static addSpecification(slave: Islave): void {
    let spec = ConfigSpecification.getSpecificationByFilename(slave.specificationid)
    slave.specification = spec
  }
  static writeslave(busid: number, slave: Islave): void {
    // Make sure slaveid is unique
    let oldFilePath = ConfigBus.getslavePath(busid, slave)
    let filename = Config.getFileNameFromSlaveId(slave.slaveid)
    let newFilePath = ConfigBus.getslavePath(busid, slave)
    let dir = path.dirname(newFilePath)
    if (!fs.existsSync(dir))
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch (e) {
        debug('Unable to create directory ' + dir + ' + e')
        throw e
      }
    let o = structuredClone(slave)
    for (var prop in o) {
      if (Object.prototype.hasOwnProperty.call(o, prop)) {
        let deletables: string[] = [
          'specification',
          'durationOfLongestModbusCall',
          'triggerPollTopic',
          'modbusErrorStatistic',
          'modbusStatusForSlave',
        ]
        if (deletables.includes(prop)) delete (o as any)[prop]
      }
    }
    if (o.noDiscovery != undefined && o.noDiscovery == false) delete (o as any).noDiscovery
    if (o.noDiscoverEntities != undefined && o.noDiscoverEntities.length == 0) delete (o as any).noDiscoverEntities

    let s = stringify(o)
    fs.writeFileSync(newFilePath, s, { encoding: 'utf8' })
    if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath))
      fs.unlink(oldFilePath, (err: any) => {
        debug('writeslave: Unable to delete ' + oldFilePath + ' ' + err)
      })
    let spec: Ispecification | undefined = undefined
    if (slave.specificationid) {
      ConfigBus.addSpecification(slave)
      let spec = ConfigSpecification.getSpecificationByFilename(slave.specificationid)
      let o = new Slave(busid, slave, Config.getConfiguration().mqttbasetopic)
      ConfigBus.emitSlaveEvent(ConfigListenerEvent.updateSlave, o, spec)
    } else debug('No Specification found for slave: ' + filename + ' specification: ' + slave.specificationid)
  }

  static getSlave(busid: number, slaveid: number): Islave | undefined {
    if (ConfigBus.busses.length <= busid) {
      debug('Config.getslave: unknown bus')
      return undefined
    }
    let rc = ConfigBus.busses[busid].slaves.find((dev) => {
      return dev.slaveid === slaveid
    })
    if (!rc) debug('slaves.length: ' + ConfigBus.busses[busid].slaves.length)
    for (let dev of ConfigBus.busses[busid].slaves) {
      debug(dev.name)
    }
    return rc
  }
  static getslaveBySlaveId(busid: number, slaveId: number) {
    let rc = ConfigBus.busses[busid].slaves.find((dev) => {
      return dev.slaveid === slaveId
    })
    return rc
  }

  static deleteSlave(busid: number, slaveid: number) {
    let bus = ConfigBus.busses.find((bus) => bus.busId == busid)
    if (bus != undefined) {
      debug('DELETE /slave slaveid' + busid + '/' + slaveid + ' number of slaves: ' + bus.slaves.length)
      let found = false
      for (let idx = 0; idx < bus.slaves.length; idx++) {
        let slave = bus.slaves[idx]

        if (slave.slaveid === slaveid) {
          found = true
          if (fs.existsSync(ConfigBus.getslavePath(busid, slave)))
            fs.unlink(ConfigBus.getslavePath(busid, slave), (err) => {
              if (err) debug(err)
            })
          ConfigBus.addSpecification(slave)
          let spec: Ispecification | undefined = undefined
          if (slave.specificationid) spec = ConfigSpecification.getSpecificationByFilename(slave.specificationid)
          let o = new Slave(busid, slave, Config.getConfiguration().mqttbasetopic)
          ConfigBus.emitSlaveEvent(ConfigListenerEvent.deleteSlave, o, spec)
          bus.slaves.splice(idx, 1)
          debug('DELETE /slave finished ' + slaveid + ' number of slaves: ' + bus.slaves.length)
          return
        }
      }
      if (!found) debug('slave not found for deletion ' + slaveid)
    } else {
      let msg = 'Unable to delete slave. Check server log for details'
      log.log(LogLevelEnum.error, msg + ' busid ' + busid + ' not found')

      throw new Error(msg)
    }
  }
  private static listDevicesUdev(next: (devices: string[]) => void, reject: (error: any) => void): void {
    SerialPort.list()
      .then((portInfo) => {
        let devices: string[] = []
        portInfo.forEach((port) => {
          devices.push(port.path)
        })
        next(devices)
      })
      .catch((error) => {
        reject(error)
      })
  }
  private static grepDevices(bodyObject: any): string[] {
    var devices: any[] = bodyObject.data.devices
    var rc: string[] = []
    devices.forEach((device) => {
      if (device.subsystem === 'tty')
        try {
          fs.accessSync(device.dev_path, fs.constants.R_OK)
          rc.push(device.dev_path)
        } catch (error) {
          log.log(LogLevelEnum.error, 'Permission denied for read serial device %s', device.dev_path)
        }
    })
    return rc
  }
  private static listDevicesHassio(next: (devices: string[]) => void, reject: (error: any) => void): void {
    Config.executeHassioGetRequest<string[]>(
      '/hardware/info',
      (dev) => {
        next(ConfigBus.grepDevices(dev))
      },
      reject
    )
  }

  static listDevices(next: (devices: string[]) => void, reject: (error: any) => void): void {
    try {
      ConfigBus.listDevicesHassio(next, (_e) => {
        this.listDevicesUdev(next, reject)
      })
    } catch (e) {
      try {
        this.listDevicesUdev(next, reject)
      } catch (e) {
        next([])
      }
    }
  }
}
