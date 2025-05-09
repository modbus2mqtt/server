import Debug from 'debug'
import { Subject } from 'rxjs'
import {
  getSpecificationI18nName,
  ImodbusEntity,
  ImodbusSpecification,
  ModbusRegisterType,
  SpecificationStatus,
} from '@modbus2mqtt/specification.shared'
import { ImodbusAddress, ModbusErrorStates, ModbusTasks } from '@modbus2mqtt/server.shared'
import { IdentifiedStates } from '@modbus2mqtt/specification.shared'
import { ConverterMap, ImodbusValues, M2mSpecification } from '@modbus2mqtt/specification'
import { ConfigBus } from './configbus'
import * as fs from 'fs'
import { submitGetHoldingRegisterRequest } from './submitRequestMock'
import { IfileSpecification } from '@modbus2mqtt/specification'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import ModbusRTU from 'modbus-serial'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import {
  Islave,
  IModbusConnection,
  IBus,
  IRTUConnection,
  ITCPConnection,
  IidentificationSpecification,
} from '@modbus2mqtt/server.shared'
import { ConfigSpecification } from '@modbus2mqtt/specification'
import { Config } from './config'
import { ModbusRTUWorker } from './ModbusRTUWorker'
import { ModbusRTUQueue } from './ModbusRTUQueue'
import { IexecuteOptions, ModbusRTUProcessor } from './ModbusRTUProcessor'
import { IModbusAPI } from './ModbusWorker'
import { ModbusTcpRtuBridge } from './tcprtubridge'
const debug = Debug('bus')
const log = new Logger('bus')

export interface IModbusResultWithDuration {
  data: number[]
  duration?: number
}
export class Bus implements IModbusAPI {
  private static busses: Bus[] | undefined = undefined
  private static allSpecificationsModbusAddresses: Set<ImodbusAddress> | undefined = undefined
  static stopBridgeServers(): void {
    Bus.getBusses().forEach((bus) => {
      if (bus.tcprtuBridge) bus.tcprtuBridge.stopServer()
    })
  }
  static readBussesFromConfig(): Promise<PromiseSettledResult<void>[]> {
    let promisses: Promise<void>[] = []
    let ibs = ConfigBus.getBussesProperties()
    if (!Bus.busses) Bus.busses = []
    ibs.forEach((ib) => {
      let bus = Bus.busses!.find((bus) => bus.getId() == ib.busId)
      if (bus !== undefined) bus.properties = ib
      else {
        let b = new Bus(ib)
        promisses.push(b.connectRTU('InitialConnect'))
        b.getSlaves().forEach((s) => {
          s.evalTimeout = true
        })
        Bus.busses!.push(b)
      }
    })
    // delete removed busses
    for (let idx = 0; idx < Bus.busses!.length; idx++) {
      if (!ibs.find((ib) => ib.busId == Bus.busses![idx].properties.busId)) Bus.busses!.splice(idx, 1)
    }
    return Promise.allSettled(promisses)
  }
  getName(): string {
    let rtu = this.properties.connectionData as IRTUConnection
    let tcp = this.properties.connectionData as ITCPConnection
    if (undefined != rtu.serialport) return rtu.serialport
    if (undefined != tcp.host) return tcp.host + ':' + tcp.port
    return 'unknown'
  }
  static getBusses(): Bus[] {
    //if (!Bus.busses || Bus.busses.length != ConfigBus.getBussesProperties().length) {
    //  Bus.readBussesFromConfig()
    //}
    //debug("getBusses Number of busses:" + Bus.busses!.length)
    return Bus.busses!
  }
  static addBus(connection: IModbusConnection): Promise<Bus> {
    return new Promise<Bus>((resolve, reject) => {
      debug('addBus()')
      let busP = ConfigBus.addBusProperties(connection)
      let b = Bus.getBusses().find((b) => b.getId() == busP.busId)
      if (b == undefined)
        Bus.readBussesFromConfig()
          .then(() => {
            let b = Bus.getBusses().find((b) => b.getId() == busP.busId)
            if (b != undefined)
              b.connectRTU('InitialConnect')
                .then(() => {
                  resolve(b!)
                })
                .catch(reject)
          })
          .catch(reject)
      else
        b.connectRTU('InitialConnect')
          .then(() => {
            resolve(b!)
          })
          .catch(reject)
    })
  }

  private connectionChanged(connection: IModbusConnection): boolean {
    let rtu = this.properties.connectionData as IRTUConnection
    if (rtu.serialport) {
      let connectionRtu = connection as IRTUConnection
      if (!connectionRtu.serialport || connectionRtu.serialport !== rtu.serialport) return true
      if (!connectionRtu.baudrate || connectionRtu.baudrate !== rtu.baudrate) return true
      if (!connectionRtu.timeout || connectionRtu.timeout !== rtu.timeout) return true
      if (!(connectionRtu.tcpBridgePort == undefined && rtu.tcpBridgePort == undefined)|| connectionRtu.tcpBridgePort !== rtu.tcpBridgePort) return true
      return false
    } else {
      let tcp = this.properties.connectionData as ITCPConnection
      let connectionTcp = connection as ITCPConnection
      if (!connectionTcp.host || connectionTcp.host !== tcp.host) return true
      if (!connectionTcp.port || connectionTcp.port !== tcp.port) return true
      if (!connectionTcp.timeout || connectionTcp.timeout !== tcp.timeout) return true
      return false
    }
  }
  private startTcpRtuBridge(port:number){
    this.tcprtuBridge = new ModbusTcpRtuBridge(this.modbusRTUQueue)
    this.tcprtuBridge.startServer(port)

  }
  private restartTcpRtuBridge(oldPort:number| undefined, newPort:number|undefined ){
    if( this.tcprtuBridge){
      //restart tcpRtuBridge if neccessary
      if( oldPort && oldPort != newPort)
        this.tcprtuBridge.stopServer(()=>{
          if(newPort)
            this.tcprtuBridge?.startServer( newPort!)
        })
    }else{
      if(newPort)
        this.startTcpRtuBridge(newPort)
    }
  }
  updateBus(connection: IModbusConnection): Promise<Bus> {
    return new Promise<Bus>((resolve, reject) => {
      debug('updateBus()')
      if (this.connectionChanged(connection)) {
          let oldTcpBrigdePort = (this.properties.connectionData as IRTUConnection).tcpBridgePort
          let newTcpBrigdePort = (connection as IRTUConnection).tcpBridgePort        
          if( this.tcprtuBridge){
            this.restartTcpRtuBridge(oldTcpBrigdePort,newTcpBrigdePort)
          }
          else
            if(newTcpBrigdePort)
              this.startTcpRtuBridge(newTcpBrigdePort)            
        let busP = ConfigBus.updateBusProperties(this.properties, connection)
        let b = Bus.getBusses().find((b) => b.getId() == busP.busId)
        if (b) {
          b.properties = busP
          // Change of bus properties can influence the modbus data
          // E.g. set of lower timeout can lead to error messages
          b.reconnectRTU('updateBus')
            .then(() => {
              resolve(b)
            })
            .catch(reject)
        } else reject('Bus does not exist')
      } else resolve(this)
    })
  }
  static deleteBus(busid: number) {
    let idx = Bus.getBusses().findIndex((b) => b.properties.busId == busid)
    if (idx >= 0) {
      Bus.getBusses().splice(idx, 1)
      ConfigBus.deleteBusProperties(busid)
    }
  }
  static getBus(busid: number): Bus | undefined {
    // debug("getBus()")
    if (Bus.getBusses() == undefined) return undefined
    return Bus.getBusses().find((b) => b.properties.busId == busid)
  }

  properties: IBus
  private modbusClient: ModbusRTU | undefined
  private modbusClientTimedOut: boolean = false
  private tcprtuBridge: ModbusTcpRtuBridge | undefined
  private _modbusRTUWorker:ModbusRTUWorker
  constructor(
    ibus: IBus,
    private modbusRTUQueue = new ModbusRTUQueue(),
    private modbusRTUprocessor = new ModbusRTUProcessor(modbusRTUQueue)
     
  ) {
    this.properties = ibus
    this._modbusRTUWorker = new ModbusRTUWorker(this, modbusRTUQueue)
    if ((ibus.connectionData as IRTUConnection).tcpBridgePort) {
      this.startTcpRtuBridge( (ibus.connectionData as IRTUConnection).tcpBridgePort!)
    }
  }
  getCacheId():number{
    return this.getId()
  }
  getId(): number {
    return this.properties.busId
  }
  private connectRTUClient(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.modbusClient == undefined) this.modbusClient = new ModbusRTU()
      if (this.modbusClient.isOpen) {
        resolve()
        return
      }

      // debug("connectRTUBuffered")
      let port = (this.properties.connectionData as IRTUConnection).serialport
      let baudrate = (this.properties.connectionData as IRTUConnection).baudrate
      if (port && baudrate) {
        this.modbusClient.connectRTUBuffered(port, { baudRate: baudrate }).then(resolve).catch(reject)
      } else {
        let host = (this.properties.connectionData as ITCPConnection).host
        let port = (this.properties.connectionData as ITCPConnection).port
        this.modbusClient.connectTCP(host, { port: port }).then(resolve).catch(reject)
      }
    })
  }
  reconnectRTU(task: string): Promise<void> {
    let rc = new Promise<void>((resolve, reject) => {
      if (this.modbusClientTimedOut) {
        if (this.modbusClient == undefined || !this.modbusClient.isOpen) {
          reject(task + ' Last read failed with TIMEOUT and modbusclient is not ready')
          return
        } else resolve()
      } else if (this.modbusClient == undefined || !this.modbusClient.isOpen) {
        this.connectRTUClient()
          .then(resolve)
          .catch((e) => {
            log.log(LogLevelEnum.error, task + ' connection failed ' + e)
            reject(e)
          })
      } else if (this.modbusClient!.isOpen) {
        this.modbusClient.close(() => {
          debug('closed')
          if (this.modbusClient!.isOpen)
            setTimeout(() => {
              if (this.modbusClient!.isOpen) reject(new Error('ModbusClient is open after close'))
              else this.reconnectRTU(task).then(resolve).catch(reject)
            }, 10)
          else this.reconnectRTU(task).then(resolve).catch(reject)
        })
      } else {
        reject(new Error(task + ' unable to open'))
      }
    })
    return rc
  }
  connectRTU(task: string): Promise<void> {
    let rc = new Promise<void>((resolve, reject) => {
      this.connectRTUClient()
        .then(resolve)
        .catch((e) => {
          log.log(LogLevelEnum.error, task + ' ' + this.getName() + ': ' + e.message)
          reject(e)
        })
    })
    return rc
  }

  closeRTU(task: string, callback: Function) {
    if (this.modbusClientTimedOut) {
      debug("Workaround: Last calls TIMEDOUT won't close")
      callback()
    } else if (this.modbusClient == undefined) {
      log.log(LogLevelEnum.error, 'modbusClient is undefined')
    } else
      this.modbusClient.close(() => {
        // debug("closeRTU: " + (this.modbusClient?.isOpen ? "open" : "closed"))
        callback()
      })
  }
  isRTUopen(): boolean {
    if (this.modbusClient == undefined) {
      log.log(LogLevelEnum.error, 'modbusClient is undefined')
      return false
    } else return this.modbusClient.isOpen
  }
  setModbusTimout(reject: (e: any) => void, e: any) {
    this.modbusClientTimedOut = e.errno && e.errno == 'ETIMEDOUT'
    reject(e)
  }
  clearModbusTimout() {
    this.modbusClientTimedOut = false
  }

  readHoldingRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    let rc = new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        reject(new Error('modbusClient is undefined'))
      } else {
        this.prepareRead(slaveid)

        let start = Date.now()
        this.modbusClient!.readHoldingRegisters(dataaddress, length)
          .then((result) => {
            this.clearModbusTimout()
            let rc: IModbusResultWithDuration = {
              data: result.data,
              duration: Date.now() - start,
            }
            resolve(rc)
          })
          .catch((e) => {
            e.duration = Date.now() - start
            this.setModbusTimout(reject, e)
          })
      }
    })
    return rc
  }
  readInputRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    let rc = new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.prepareRead(slaveid)
        let start = Date.now()
        this.modbusClient!.readInputRegisters(dataaddress, length)
          .then((result) => {
            this.clearModbusTimout()
            let rc: IModbusResultWithDuration = {
              data: result.data,
              duration: Date.now() - start,
            }
            resolve(rc)
          })
          .catch((e) => {
            this.setModbusTimout(reject, e)
          })
      }
    })
    return rc
  }
  readDiscreteInputs(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    let rc = new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.prepareRead(slaveid)
        let start = Date.now()
        this.modbusClient!.readDiscreteInputs(dataaddress, length)
          .then((resolveBoolean) => {
            this.clearModbusTimout()
            let readResult: ReadRegisterResult = {
              data: [],
              buffer: Buffer.allocUnsafe(0),
            }
            resolveBoolean.data.forEach((d) => {
              readResult.data.push(d ? 1 : 0)
            })
            let rc: IModbusResultWithDuration = {
              data: readResult.data,
              duration: Date.now() - start,
            }
            resolve(rc)
          })
          .catch((e) => {
            this.setModbusTimout(reject, e)
          })
      }
    })
    return rc
  }
  readCoils(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    let rc = new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.prepareRead(slaveid)
        let start = Date.now()
        this.modbusClient!.readCoils(dataaddress, length)
          .then((resolveBoolean) => {
            this.clearModbusTimout()
            let readResult: ReadRegisterResult = {
              data: [],
              buffer: Buffer.allocUnsafe(0),
            }
            resolveBoolean.data.forEach((d) => {
              readResult.data.push(d ? 1 : 0)
            })
            let rc: IModbusResultWithDuration = {
              data: readResult.data,
              duration: Date.now() - start,
            }
            resolve(rc)
          })
          .catch((e) => {
            this.setModbusTimout(reject, e)
          })
      }
    })
    return rc
  }
  private prepareRead(slaveid: number) {
    this.modbusClient!.setID(slaveid)
    let slave = this.getSlaveBySlaveId(slaveid)
    if (slave) {
      if (slave.modbusTimout == undefined) slave.modbusTimout = (this.properties.connectionData as IRTUConnection).timeout
      this.modbusClient!.setTimeout(slave.modbusTimout)
    }
  }
  getMaxModbusTimeout() {
    return (this.properties.connectionData as IRTUConnection).timeout
  }

  writeHoldingRegisters(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    let rc = new Promise<void>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.modbusClient!.setID(slaveid)
        this.modbusClient!.setTimeout((this.properties.connectionData as IRTUConnection).timeout)
        this.modbusClient!.writeRegisters(dataaddress, data)
          .then(() => {
            this.modbusClientTimedOut = false
            resolve()
          })
          .catch((e) => {
            this.setModbusTimout(reject, e)
          })
      }
    })
    return rc
  }
  writeCoils(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    let rc = new Promise<void>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.modbusClient!.setID(slaveid)
        this.modbusClient!.setTimeout((this.properties.connectionData as IRTUConnection).timeout)
        let dataB: boolean[] = []
        data.forEach((d) => {
          dataB.push(d == 1)
        })
        if (dataB.length === 1) {
          //Using writeCoil for single value in case of situation that device does not support multiple at once like
          // LC Technology relay/input boards
          this.modbusClient!.writeCoil(dataaddress, dataB[0])
            .then(() => {
              this.modbusClientTimedOut = false
              resolve()
            })
            .catch((e) => {
              this.setModbusTimout(reject, e)
            })
        } else {
          this.modbusClient!.writeCoils(dataaddress, dataB)
            .then(() => {
              this.modbusClientTimedOut = false
              resolve()
            })
            .catch((e) => {
              this.setModbusTimout(reject, e)
            })
        }
      }
    })
    return rc
  }

  deleteSlave(slaveid: number) {
    ConfigBus.deleteSlave(this.properties.busId, slaveid)
  }
  static getModbusAddressesForSpec(spec: IfileSpecification, addresses: Set<ImodbusAddress>): void {
    for (let ent of spec.entities) {
      let converter = ConverterMap.getConverter(ent)
      if (ent.modbusAddress != undefined && converter && ent.registerType)
        for (let i = 0; i < converter.getModbusLength(ent); i++) {
          addresses.add({
            address: ent.modbusAddress + i,
            registerType: ent.registerType,
          })
        }
    }
  }
  private static updateAllSpecificationsModbusAddresses(specificationid: string | null) {
    let cfg = new Config()
    // If a used specificationid was deleted, remove it from slaves
    if (specificationid != null) {
      new ConfigSpecification().filterAllSpecifications((spec) => {
        if (spec.filename == specificationid) specificationid = null
      })
      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((slave) => {
          debug('updateAllSpecificationsModbusAddresses slaveid: ' + slave.slaveid)
          if (specificationid == null) slave.specificationid = undefined
          else slave.specificationid = specificationid
          if (slave.specificationid == specificationid) ConfigBus.writeslave(bus.getId(), slave)
        })
      })
    }
    Bus.allSpecificationsModbusAddresses = new Set<ImodbusAddress>()
    new ConfigSpecification().filterAllSpecifications((spec) => {
      Bus.getModbusAddressesForSpec(spec, Bus.allSpecificationsModbusAddresses!)
    })
  }
  /*
   * returns cached set of all modbusaddresses for all specifications.
   * It will be updated after any change to Config.specifications array
   */
  private static getModbusAddressesForAllSpecs(): Set<ImodbusAddress> {
    debug('getAllModbusAddresses')
    if (!Bus.allSpecificationsModbusAddresses) {
      Bus.updateAllSpecificationsModbusAddresses(null)
      // Config.getSpecificationsChangedObservable().subscribe(Bus.updateAllSpecificationsModbusAddresses)
    }
    return Bus.allSpecificationsModbusAddresses!
  }

  readModbusRegister(slaveId: number, addresses: Set<ImodbusAddress>, options: IexecuteOptions): Promise<ImodbusValues> {
    if (Config.getConfiguration().fakeModbus) return submitGetHoldingRegisterRequest(slaveId, addresses)

    if (this.modbusClient && this.modbusClient.isOpen) return this.modbusRTUprocessor.execute(slaveId, addresses, options)
    else
      return new Promise<ImodbusValues>((resolve, reject) => {
        this.connectRTU('InitialConnect')
          .then(() => {
            return this.modbusRTUprocessor.execute(slaveId, addresses, options).then(resolve).catch(reject)
          })
          .catch((e) => {
            let addr = addresses.values().next().value
            if (addr) {
              let date = new Date()
              this._modbusRTUWorker.addError(
                {
                  slaveId: slaveId,
                  address: addr,
                  onResolve: (qe) => {},
                  onError: (e) => {},
                  options: { task: ModbusTasks.initialConnect, errorHandling: {} },
                },
                ModbusErrorStates.initialConnect,
                date
              )
            }
            reject(e)
          })
      })
  }

  writeModbusRegister(
    slaveId: number,
    address: number,
    registerType: ModbusRegisterType,
    data: number[],
    options: IexecuteOptions
  ): Promise<void> {
    let executeWrite = (onResolve: () => void, onReject: (e: any) => void) => {
      let addr: ImodbusAddress = { address: address, length: data.length, registerType: registerType, write: data }
      this.modbusRTUQueue.enqueue(slaveId, addr, onResolve, onReject, options)
    }
    if (this.modbusClient && this.modbusClient.isOpen)
      return new Promise((onResolve, onReject) => {
        executeWrite.bind(this)(onResolve, onReject)
      })
    else
      return new Promise<void>((resolve, reject) => {
        this.connectRTU('InitialConnect')
          .then(() => {
            executeWrite.bind(this)(resolve, reject)
          })
          .catch(reject)
      })
  }

  /*
   * getAvailableSpecs uses bus.slaves cache if possible
   */
  getAvailableSpecs(slaveid: number, showAllPublicSpecs: boolean, language: string): Promise<IidentificationSpecification[]> {
    return new Promise<IidentificationSpecification[]>((resolve, reject) => {
      let addresses = Bus.getModbusAddressesForAllSpecs()

      let rcf = (ispecs:IidentificationSpecification[],modbusData: ImodbusValues): void => {
        let slave = this.getSlaveBySlaveId(slaveid)
        let cfg = new ConfigSpecification()
        cfg.filterAllSpecifications((spec) => {
          let mspec = M2mSpecification.fileToModbusSpecification(spec, modbusData)
          debug('getAvailableSpecs')
          if (mspec) {
            // list only identified public specs, but all local specs
            // Make sure the current configured specification is in the list
            if (
              [SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status) &&
              (showAllPublicSpecs ||
                (slave && slave.specificationid == mspec.filename) ||
                mspec.identified == IdentifiedStates.identified)
            )
              iSpecs.push(this.convert2IidentificationSpecification(slaveid, mspec, language))
            else if (![SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status))
              iSpecs.push(this.convert2IidentificationSpecification(slaveid, mspec, language))
          } else if (
            ![SpecificationStatus.published, SpecificationStatus.contributed].includes(spec.status) ||
            (slave && slave.specificationid == spec.filename)
          )
            iSpecs.push(this.convert2IidentificationSpecificationFromSpec(slaveid, spec, language, IdentifiedStates.notIdentified))
        })
      }
      let iSpecs: IidentificationSpecification[] = []
      // no result in cache, read from modbus
      // will be called once (per slave)
      let usbPort = (this.properties.connectionData as IRTUConnection).serialport
      if (usbPort && !fs.existsSync(usbPort)) {
        reject(new Error('RTU is configured, but device is not available'))
        return
      }
      this.readModbusRegister(slaveid, addresses, {
        task: ModbusTasks.deviceDetection,
        printLogs: false,
        errorHandling: { split: true },
        useCache: true,
      })
        .then((values) => {
          // Add not available addresses to the values
          // Store it for cache
          rcf(iSpecs, values)
          resolve(iSpecs)

        })
        .catch(reject)
    })
  }

  private convert2IidentificationSpecification(
    slaveid: number,
    mspec: ImodbusSpecification,
    language: string
  ): IidentificationSpecification {
    // for each spec
    let entityIdentifications: ImodbusEntity[] = []
    for (let ment of mspec.entities) {
      entityIdentifications.push(ment)
    }
    let configuredslave = this.properties.slaves.find((dev) => dev.specificationid === mspec.filename && dev.slaveid == slaveid)
    let name: string | undefined | null = getSpecificationI18nName(mspec, language)
    if (name == null) name = undefined
    return {
      filename: mspec.filename,
      name: name,
      status: mspec.status!,
      identified: mspec.identified,
      entities: ConfigBus.getIdentityEntities(mspec, language),
    }
  }
  private convert2IidentificationSpecificationFromSpec(
    slaveid: number,
    spec: IfileSpecification,
    language: string,
    identified: IdentifiedStates
  ): IidentificationSpecification {
    // for each spec
    let name: string | undefined | null = getSpecificationI18nName(spec, language)
    if (name == null) name = undefined
    let configuredslave = this.properties.slaves.find((dev) => dev.specificationid === spec.filename && dev.slaveid == slaveid)
    return {
      filename: spec.filename,
      name: name,
      identified: identified,
      status: spec.status!,
      entities: ConfigBus.getIdentityEntities(spec, language),
    }
  }

  writeSlave(slave: Islave): Islave {
    if (slave.slaveid < 0) throw new Error('Try to save invalid slave id ') // Make sure slaveid is unique
    let oldIdx = this.properties.slaves.findIndex((dev) => {
      return dev.slaveid === slave.slaveid
    })
    ConfigBus.writeslave(this.properties.busId, slave)

    if (oldIdx >= 0) this.properties.slaves[oldIdx] = slave
    else this.properties.slaves.push(slave)
    return slave
  }

  private getISlave(properties: Islave, language?: string): Islave {
    if (properties && properties.specificationid) {
      let spec = ConfigSpecification.getSpecificationByFilename(properties.specificationid)
      if (spec) {
        let name = null
        if (language) name = getSpecificationI18nName(spec, language)
        let iident: IidentificationSpecification = {
          filename: spec.filename,
          name: name ? name : undefined,
          status: spec.status,
          identified: IdentifiedStates.unknown,
          entities: ConfigBus.getIdentityEntities(spec, language),
        }
        properties.specification = spec
      }
      properties.modbusErrorsForSlave = this._modbusRTUWorker.getErrors(properties.slaveid)
    }
    return properties
  }
  getSlaves(language?: string): Islave[] {
    this.properties.slaves.forEach((s) => {
      s = this.getISlave(s, language)
    })
    return this.properties.slaves
  }
  getSlaveBySlaveId(slaveid: number, language?: string): Islave | undefined {
    let slave = this.properties.slaves.find((dev) => dev.slaveid == slaveid)
    if (slave) slave = this.getISlave(slave, language)
    return slave
  }
  public static cleanupCaches() {
    Bus.getBusses().forEach((bus) => bus._modbusRTUWorker.cleanupCache())
  }
}
