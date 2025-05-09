import { Config, ConfigListenerEvent } from './config'
import { ConfigSpecification, ConverterMap } from '@modbus2mqtt/specification'
import { format } from 'util'
import {
  Inumber,
  Iselect,
  getSpecificationI18nEntityOptionName,
  getSpecificationI18nName,
  IselectOption,
  ImodbusSpecification,
  EnumStateClasses,
  Itext,
  Ispecification,
  Converters,
} from '@modbus2mqtt/specification.shared'
import { Ientity, ImodbusEntity, VariableTargetParameters, getSpecificationI18nEntityName } from '@modbus2mqtt/specification.shared'
import { IClientOptions, IClientPublishOptions, MqttClient, connect } from 'mqtt'
import { Modbus } from './modbus'
import { Bus } from './bus'
import { ConfigBus } from './configbus'
import Debug from 'debug'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import { ImqttClient, Islave, ModbusTasks, PollModes, Slave } from '@modbus2mqtt/server.shared'
import { Mutex } from 'async-mutex'
import { QoS } from 'mqtt-packet'

import { Observable } from 'rxjs'
import { Converter } from '@modbus2mqtt/specification/dist/converter'
const debug = Debug('mqttdiscover')
const debugAction = Debug('actions')
const debugMqttClient = Debug('mqttclient')
const log = new Logger('mqttdiscover')
const defaultPollCount = 50 // 5 seconds
export interface ItopicAndPayloads {
  topic: string
  payload: string | Buffer
  entityid: number
}
const retain: IClientPublishOptions = { retain: true, qos: 1 }
const modbusValues = 'modbusValues'

export interface ImqttDevice extends Islave {
  busid: number
}

class BusSlave {
  constructor(
    private busid: number,
    private slaveid: number
  ) {}
  get key(): string {
    return `${this.busid}${Config.getFileNameFromSlaveId(this.slaveid)}`
  }
}

interface IDiscoveryIds {
  busSlave: string
  entityid: number
}

export class MqttDiscover {
  private client?: MqttClient
  private subscribedSlaves: Slave[] = []
  private isSubscribed: boolean
  private static lastMessage: string = ''
  private interval: NodeJS.Timeout | undefined
  private isPolling: boolean = false
  private pollMutex = new Mutex()
  validate(_discover: any) {
    // currently no meaningful checks
  }
  private pollCounts: Map<string, number> = new Map<string, number>()
  private triggers: { slave: Slave; force: boolean }[] = []
  private onDestroy(this: MqttDiscover) {
    if (this.client) this.client.end()
  }
  private static instance: MqttDiscover

  static getInstance(): MqttDiscover {
    if (MqttDiscover.instance) return MqttDiscover.instance

    MqttDiscover.instance = new MqttDiscover()

    return MqttDiscover.instance
  }

  constructor() {
    this.onConnectCallbacks = []

    const reg = new FinalizationRegistry(this.onDestroy.bind(this))
    this.isSubscribed = false
    reg.register(this, 0)
    ConfigBus.addListener(ConfigListenerEvent.addSlave, this.onUpdateSlave.bind(this))
    ConfigBus.addListener(ConfigListenerEvent.deleteSlave, this.onDeleteSlave.bind(this))
    ConfigBus.addListener(ConfigListenerEvent.updateSlave, this.onUpdateSlave.bind(this))
    ConfigBus.addListener(ConfigListenerEvent.deleteBus, this.onDeleteBus.bind(this))
  }
  // bus/slave name:entity id:payload
  getSlaveBaseTopics(): string[] {
    return this.subscribedSlaves.map<string>((value) => value.getBaseTopic())
  }
  getSlave(topic: string): Slave | undefined {
    return this.subscribedSlaves.find((value) => topic.startsWith(value.getBaseTopic()))
  }
  private generateEntityConfigurationTopic(slave: Slave, ent: Ientity): string {
    let haType = 'sensor'
    if (ent.readonly)
      switch (ent.converter) {
        case 'binary':
          haType = 'binary_sensor'
          break
      }
    else
      switch (ent.converter) {
        case 'binary':
          haType = 'switch'
          break
        default:
          haType = ent.converter
      }

    return (
      Config.getConfiguration().mqttdiscoveryprefix +
      '/' +
      haType +
      '/' +
      slave.getBusId() +
      's' +
      slave.getSlaveId() +
      '/e' +
      ent.id +
      '/config'
    )
  }
  private generateDiscoveryPayloads(slave: Slave, spec: ImodbusSpecification): ItopicAndPayloads[] {
    let payloads: ItopicAndPayloads[] = []
    // instantiate the converters
    try {
      let language = Config.getConfiguration().mqttdiscoverylanguage
      if (language)
        for (let e of spec.entities) {
          // !slave.suppressedEntities.includes(e.id)
          if (e.id >= 0 && !e.variableConfiguration) {
            let converter = ConverterMap.getConverter(e)
            let ent: ImodbusEntity = e as ImodbusEntity

            if (converter) {
              var obj: any = new Object()
              obj.device = new Object()
              let slaveName = slave.getName()
              if (!obj.device.name)
                if (slaveName) obj.device.name = slaveName
                else {
                  let name = getSpecificationI18nName(spec, language, false)
                  if (name) obj.device.name = name
                }

              if (!obj.device.manufacturer && spec.manufacturer) obj.device.manufacturer = spec.manufacturer
              if (!obj.device.model && spec.model) obj.device.model = spec.model
              obj.device.identifiers = ['m2m' + slave.getBusId() + 's' + slave.getSlaveId()]
              spec.entities.forEach((ent1) => {
                if (ent1.variableConfiguration) {
                  switch (ent1.variableConfiguration.targetParameter) {
                    case VariableTargetParameters.deviceSerialNumber:
                      let sn = (ent1 as ImodbusEntity).mqttValue
                      if (sn) obj.device.serial_number = sn
                      break
                    case VariableTargetParameters.deviceSWversion:
                      let sv = (ent1 as ImodbusEntity).mqttValue
                      if (sv) obj.device.sw_version = sv
                      break
                    // case VariableTargetParameters.deviceIdentifiers:
                    //   let o = (ent1 as ImodbusEntity).mqttValue
                    //   if (o) obj.device.identifiers.push(o)
                    //   break
                    case VariableTargetParameters.entityUom:
                      if (e.id == ent1.variableConfiguration.entityId && converter!.getParameterType(e) === 'Inumber') {
                        obj.unit_of_measurement = (ent1 as ImodbusEntity).mqttValue
                      }
                      break

                    // Add additionial device attributes here
                    // obj.device.<???> = (ent1 as ImodbusEntity).mqttValue;
                  }
                }
              })
              if (e.forceUpdate) obj.force_update = true
              if (e.entityCategory && e.entityCategory.length) obj.entity_category = e.entityCategory

              if (e.icon) obj.icon = e.icon
              if (!e.variableConfiguration) {
                let name = getSpecificationI18nEntityName(spec, language, e.id)
                let filename = Config.getFileNameFromSlaveId(slave.getSlaveId())
                if (!obj.name && name) obj.name = name
                if (!obj.object_id && e.mqttname) obj.object_id = e.mqttname
                if (!obj.unique_id) obj.unique_id = 'M2M' + slave.getBusId() + filename + e.mqttname

                if (!obj.value_template)
                  obj.value_template = e.value_template ? e.value_template : '{{ value_json.' + obj.object_id + ' }}'
                if (!obj.state_topic) obj.state_topic = slave.getStateTopic()
                if (!obj.availability && !obj.availability_topic) obj.availability_topic = slave.getAvailabilityTopic()
                let cmdTopic = slave.getEntityCommandTopic(ent)
                if (!obj.command_topic && !e.readonly) obj.command_topic = cmdTopic ? cmdTopic.commandTopic : undefined
                switch (converter.getParameterType(e)) {
                  case 'Iselect':
                    if (!e.readonly) {
                      let ns = e.converterParameters as Iselect
                      if (e.converter === 'select' && ns && ns.optionModbusValues && ns.optionModbusValues.length) {
                        obj.options = []
                        for (let modbusValue of ns.optionModbusValues)
                          obj.options.push(getSpecificationI18nEntityOptionName(spec, language, e.id, modbusValue))

                        if (obj.options == undefined || obj.options.length == 0)
                          log.log(LogLevelEnum.warn, 'generateDiscoveryPayloads: No options specified for ' + obj.name)
                        else
                          obj.options.forEach((o: IselectOption) => {
                            if (!o) log.log(LogLevelEnum.warn, 'generateDiscoveryPayloads: option with no text for ' + e.id)
                          })
                      }
                      obj.device_class = 'enum'
                      if (e.converter === 'binary' && ns.device_class) obj.device_class = ns.device_class
                    }
                    break
                  case 'Inumber':
                    let nn = e.converterParameters as Inumber
                    if (!obj.unit_of_measurement && nn && nn.uom) obj.unit_of_measurement = nn.uom
                    if (nn && nn.device_class && nn.device_class.toLowerCase() != 'none') obj.device_class = nn.device_class
                    if (nn && nn.state_class && nn.state_class) obj.state_class = MqttDiscover.getStateClass(nn.state_class)
                    if (e.converter === 'number' && !e.readonly) {
                      if (nn.step) obj.step = nn.step
                      if (nn.identification) {
                        if (nn.identification.min != undefined) obj.min = nn.identification.min
                        if (nn.identification.max != undefined) obj.max = nn.identification.max
                      }
                    }
                    if (nn.decimals != undefined) obj.suggested_display_precision = nn.decimals
                    break
                  case 'Itext':
                    if (!e.readonly) {
                      let nt = e.converterParameters as Itext
                      if (nt.stringlength > 0) obj.max = nt.stringlength
                      if (nt.identification && nt.identification.length) obj.pattern = nt.identification
                    }
                    break
                }
                payloads.push({
                  topic: this.generateEntityConfigurationTopic(slave, e),
                  payload: JSON.stringify(obj),
                  entityid: e.id,
                })
              }
            }
          }
        }
      else {
        log.log(LogLevelEnum.error, 'generateDiscoveryPayloads: specification or language is undefined')
      }
    } catch (e: any) {
      debug('Exception ' + e.message)
      log.log(LogLevelEnum.error, e.message)
    }
    return payloads
  }
  static getStateClass(state_class: EnumStateClasses): string {
    switch (state_class) {
      case EnumStateClasses.measurement:
        return 'measurement'
      case EnumStateClasses.total:
        return 'total'
      case EnumStateClasses.total_increasing:
        return 'total_increasing'
      default:
        return ''
    }
  }

  private getSubscribedSlaveFromDiscoveryTopic(topic: string): { slave?: Slave; entityId?: number } {
    let pathes = topic.split('/')

    if (pathes[2].match(/^[0-9]*s[0-9]*$/g) == null || pathes[3].match(/^e[0-9]*$/g) == null) return {}
    let busSlave = pathes[2].split('s')
    let busId = parseInt(busSlave[0])
    let slaveId = parseInt(busSlave[1])
    let entityId = parseInt(pathes[3].substring(1))
    return {
      slave: this.subscribedSlaves.find((s) => s.getBusId() == busId && s.getSlaveId() == slaveId),
      entityId: entityId,
    }
  }
  private static getBusAndSlaveFromTopic(topic: string): { bus: Bus; slave: Islave } {
    let parts = topic.split('/')
    let msg = ''

    if (parts.length > 2) {
      let busid = Number.parseInt(parts[2].substring(0, 1))
      let slaveid = Number.parseInt(parts[2].substring(2))
      let bus = Bus.getBus(busid)
      if (!bus) {
        log.log(LogLevelEnum.error, 'getBusAndSlaveFromTopic: invalid busid ' + busid)
        throw new Error('getBusAndSlaveFromTopic' + busid)
      }

      const device = bus!.getSlaveBySlaveId(slaveid)
      if (device)
        return {
          bus: bus,
          slave: device,
        }
      else throw new Error('device ' + slaveid + 'not found for Bus' + busid)
    }
    throw new Error('Invalid topic. No bus and slave information: ' + topic)
  }
  private onMqttCommandMessage(topic: string, payload: Buffer): string {
    try {
      let busAndSlave = MqttDiscover.getBusAndSlaveFromTopic(topic)
      if (undefined == busAndSlave.slave.specificationid) throw new Error('No specification Id for slave available')
      const spec = ConfigSpecification.getSpecificationByFilename(busAndSlave.slave.specificationid)
      let parts = topic.split('/')
      if (spec && parts.length >= 4) {
        const entity = spec.entities.find((ent) => {
          return 'e' + ent.id == parts[3]
        })
        if (entity) {
          const cnv = ConverterMap.getConverter(entity)
          if (cnv) {
            let promise: Promise<void>
            let modbus = parts.length == 5 && parts[4] == modbusValues
            if (!Config.getConfiguration().fakeModbus) {
              if (modbus)
                promise = Modbus.writeEntityModbus(
                  busAndSlave.bus,
                  busAndSlave.slave.slaveid,
                  entity,
                  JSON.parse(payload.toString())
                )
              else promise = Modbus.writeEntityMqtt(busAndSlave.bus, busAndSlave.slave.slaveid, spec, entity.id, payload.toString())
            } // for Testing
            else return (modbus ? 'Modbus ' : 'MQTT ') + payload.toString()
          }
        } else throw new Error('Entity not found topic ' + topic)
      } else throw new Error('No entity passed to command topic ' + topic)
    } catch (e: any) {
      return e.message as string
    }
    return 'unknown issue'
  }
  private sendCommandModbus(slave: Slave, entity: Ientity, modbus: boolean, payload: string): Promise<void> {
    let cnv: Converter | undefined = undefined
    if (entity.converter) cnv = ConverterMap.getConverter(entity)
    if (cnv) {
      if (modbus)
        return Modbus.writeEntityModbus(Bus.getBus(slave.getBusId())!, slave.getSlaveId(), entity, [Number.parseInt(payload)])
      else {
        let spec = ConfigSpecification.getSpecificationByFilename(slave.getSpecificationId())
        if (spec)
          return Modbus.writeEntityMqtt(Bus.getBus(slave.getBusId())!, slave.getSlaveId(), spec, entity.id, payload.toString())
      }
    }
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('No Converter or spec found for spec/entity ' + slave.getSpecificationId() + '/' + entity.mqttname))
    })
  }
  // returns a promise for testing
  private onMqttMessage(topic: string, payload: Buffer): Promise<void> {
    if (topic) {
      debug('onMqttMessage: ' + topic)
      let s = this.subscribedSlaves.find((s) => topic.startsWith(s.getBaseTopic()!))
      if (s) {
        if (s.getTriggerPollTopic() == topic) {
          debug('Triggering Poll')
          return this.readModbusAndPublishState(s) as any as Promise<void>
        } else if (payload != undefined && payload != null) {
          if (topic == s.getCommandTopic()) return this.sendCommand(s, payload.toString('utf-8')) as any as Promise<void>
          else if (topic.startsWith(s.getBaseTopic()) && topic.indexOf('/set/') != -1) {
            return this.sendEntityCommandWithPublish(s, topic, payload.toString('utf-8')) as any as Promise<void>
          }
        }
      }
    }
    return new Promise<void>((resolve) => {
      resolve()
    })
  }
  sendEntityCommandWithPublish(slave: Slave, topic: string, payload: string): Promise<ImodbusSpecification> {
    let entity = slave.getEntityFromCommandTopic(topic)
    if (entity && !entity.readonly)
      return new Promise<ImodbusSpecification>((resolve, reject) => {
        this.sendEntityCommand(slave, topic, payload.toString())
          .then(() => {
            this.readModbusAndPublishState(slave).then(resolve).catch(reject)
          })
          .catch(reject)
      })
    log.log(LogLevelEnum.error, 'No writable entity found for topic ' + topic)
    return new Promise<ImodbusSpecification>((_resolve, reject) => {
      reject(new Error('No writable entity found for topic ' + topic))
    })
  }
  private sendEntityCommand(slave: Slave, topic: string, payload: string): Promise<void> {
    let entity = slave.getEntityFromCommandTopic(topic)
    if (entity && !entity.readonly) return this.sendCommandModbus(slave, entity, topic.endsWith('/set/modbus/'), payload.toString())
    log.log(LogLevelEnum.error, 'No writable entity found for topic ' + topic)
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('No writable entity found for topic ' + topic))
    })
  }

  private getEntityFromSlave(slave: Slave, mqttname: string): Ientity | undefined {
    let spec = slave.getSpecification()
    let entity: Ientity | undefined
    if (spec) entity = spec.entities.find((e) => e.mqttname == mqttname)
    return entity
  }
  sendCommand(slave: Slave, payload: string): Promise<ImodbusSpecification> {
    return new Promise<ImodbusSpecification>((resolve, reject) => {
      let p = JSON.parse(payload)
      let promisses: Promise<void>[] = []
      if (typeof p != 'object') {
        reject(new Error('Send Command failed: payload is an object ' + payload))
        return
      }
      if (p.modbusValues) {
        Object.getOwnPropertyNames(p.modbusValues).forEach((propName) => {
          let entity: Ientity | undefined = this.getEntityFromSlave(slave, propName)
          if (entity && !entity.readonly)
            promisses.push(this.sendCommandModbus(slave, entity, true, p.modbusValues[propName].toString()))
        })
      }
      Object.getOwnPropertyNames(p).forEach((propName) => {
        let value = p[propName].toString()
        let entity: Ientity | undefined = this.getEntityFromSlave(slave, propName)
        if (entity && !entity.readonly && (p.modbusValues == undefined || p.modbusValues[propName] == undefined))
          promisses.push(this.sendCommandModbus(slave, entity, false, value))
      })
      if (promisses.length > 0)
        Promise.all<void>(promisses).then(() => {
          this.readModbusAndPublishState(slave).then(resolve).catch(reject)
        })
      else reject(new Error('No writable entity found in payload ' + payload))
    })
  }
  private containsTopic(tp: ItopicAndPayloads, tps: ItopicAndPayloads[]) {
    let t = tps.findIndex((t) => tp.topic === t.topic)
    return -1 != t
  }

  private generateDiscoveryEntities(slave: Slave, deleteAllEntities: boolean = false): ItopicAndPayloads[] {
    let tAndPs: ItopicAndPayloads[] = []
    let subscribedSlave = this.subscribedSlaves.find((s) => 0 == Slave.compareSlaves(s, slave))
    let newSpec = slave.getSpecification()
    let oldSpec = subscribedSlave ? subscribedSlave.getSpecification() : undefined
    if (oldSpec && oldSpec.entities) {
      oldSpec.entities.forEach((oldEnt) => {
        let newEnt = newSpec?.entities.find((newE) => newE.id == oldEnt.id)
        let newTopic = newEnt ? this.generateEntityConfigurationTopic(slave, newEnt) : undefined
        let oldTopic = oldEnt ? this.generateEntityConfigurationTopic(slave, oldEnt) : undefined
        if (oldTopic)
          if (
            !newSpec ||
            deleteAllEntities ||
            slave.getNoDiscovery() ||
            slave.getNoDiscoverEntities().includes(oldEnt.id) ||
            !newEnt ||
            newTopic != oldTopic
          ) {
            if (oldEnt) debug('delete entity ' + slave.getBusId() + 's' + slave.getSlaveId() + '/e' + oldEnt.id)
            else debug('delete Bus/slave ')
            tAndPs.push({ topic: oldTopic, payload: Buffer.alloc(0), entityid: 0 }) // delete entity
          }
      })
    }
    if (!deleteAllEntities && newSpec && newSpec.entities) {
      this.generateDiscoveryPayloads(slave, newSpec as ImodbusSpecification).forEach((tp) => {
        if (!slave.getNoDiscoverEntities().includes(tp.entityid) && !slave.getNoDiscovery()) {
          tAndPs.push({ topic: tp.topic, payload: tp.payload, entityid: 0 }) // write entity
        }
      })
    }
    return tAndPs
  }

  private error(msg: any): void {
    let message = "MQTT: Can't connect to " + Config.getConfiguration().mqttconnect.mqttserverurl + ' ' + msg.toString()
    if (message !== MqttDiscover.lastMessage) log.log(LogLevelEnum.error, message)
    MqttDiscover.lastMessage = message
  }
  private onConnectCallbacks: ((mqttClient: MqttClient) => void)[]
  private executeActions(mqttClient: MqttClient) {
    let callback = this.onConnectCallbacks.shift()
    while (mqttClient && mqttClient.connected && callback) {
      callback(mqttClient!)
      callback = this.onConnectCallbacks.shift()
    }
  }
  private handleErrors(e: Error) {
    log.log(LogLevelEnum.error, 'MQTT error: ' + e.message)
  }
  private onConnect(mqttClient: MqttClient) {
    debug('reconnecting MQTT')
    this.resubscribe(this.client!)
    this.executeActions(this.client!)
  }

  private connectMqtt(connectionData: ImqttClient | undefined): void {
    let mqttConnect = Config.getConfiguration().mqttconnect
    if (Config.getConfiguration().mqttusehassio && Config.mqttHassioLoginData) mqttConnect = Config.mqttHassioLoginData
    let conn = () => {
      if (!connectionData) connectionData = mqttConnect
      if (!connectionData) {
        this.handleErrors(new Error('No mqtt connection configured.'))
        return
      }
      if (connectionData.mqttserverurl) {
        let opts = connectionData
        // connect need IClientOptions which has some additional properties in the type
        let iopts = connectionData as IClientOptions
        iopts.log = (...args) => {
          let message = args.shift()
          debugMqttClient(format(message, args))
        }
        iopts.clean = false
        iopts.reconnectPeriod = 1000
        iopts.keepalive = 50000
        iopts.clientId = Config.getConfiguration().mqttbasetopic
        if (iopts.ca == undefined) delete iopts.ca
        if (iopts.key == undefined) delete iopts.key
        if (iopts.cert == undefined) delete iopts.cert

        if (this.client) this.client.reconnect(opts as IClientOptions)
        else this.client = connect(connectionData.mqttserverurl, opts as IClientOptions)
        this.client.removeAllListeners('error')
        this.client.removeAllListeners('message')
        this.client.removeAllListeners('connect')
        this.client.removeAllListeners('connect')
        this.client.on('error', this.handleErrors.bind(this))
        this.client.on('message', this.onMqttMessage.bind(this))
        this.client.on('connect', this.onConnect.bind(this, this.client))
        this.client.on('reconnect', this.onConnect.bind(this, this.client))
      } else {
        this.handleErrors(new Error('mqtt server url is not defined'))
      }
    }

    if (this.client != undefined) {
      if (this.equalConnectionData(this.client, mqttConnect)) {
        if (!this.client.connected) conn()
        else this.executeActions(this.client)
      } else {
        // reconnect with new connection date
        this.client.end(() => {
          this.client = undefined
          conn()
        })
      }
    } else conn()
  }

  validateConnection(connectionData: ImqttClient | undefined, callback: (valid: boolean, message: string) => void) {
    if (connectionData && connectionData.mqttserverurl != undefined) {
      let client = connect(connectionData.mqttserverurl, connectionData as IClientOptions)
      client.on('error', (e) => {
        client!.end(() => {})
        callback(false, e.toString())
      })
      client.on('connect', () => {
        callback(true, 'OK')
        if (client) client.end(() => {})
      })
    } else callback(false, 'no mqttserverlurl passes')
  }

  private equalConnectionData(client: MqttClient, clientConfiguration: ImqttClient): boolean {
    return (
      client.options.protocol + '://' + client.options.host + ':' + client.options.port == clientConfiguration.mqttserverurl &&
      client.options.username == clientConfiguration.username &&
      client.options.password == clientConfiguration.password
    )
  }
  mqttClientMutex: Mutex = new Mutex()
  private getMqttClient(onConnectCallback: (connection: MqttClient) => void): void {
    this.onConnectCallbacks.push(onConnectCallback)
    this.connectMqtt(undefined)
  }

  private resubscribe(mqttClient: MqttClient) {
    this.subscribedSlaves.forEach((slave) => {
      let options = { qos: this.generateQos(slave, slave.getSpecification()) }
      mqttClient.subscribe(slave.getTriggerPollTopic(), options)
      let cmdTopic = slave.getCommandTopic()
      if (cmdTopic) {
        mqttClient.subscribe(cmdTopic, options)
        mqttClient.subscribe(slave.getEntityCommandTopicFilter(), options)
      }
    })
  }

  private publish() {}
  private unsubscribe() {}
  // Discovery update when
  // Bus changed
  // Bus deleted
  // Slave changed: subscribeSlave
  // Slave deleted: unsubscribeSlave
  // Specification changed
  // Specification deleted
  // Bus changed: Iterate all slaves of bus PublishDiscovery and State
  // Bus deleted: nothing to do, but delete discovery
  // Slave changed:  PublishDiscovery and State of changed Slave, delete outdated discoveries
  // Slave deleted: nothing to do, but delete outdated discoveries
  // Specification changed: Iterate all Busses/Slaves update Discovery and State delete outdated discoveries
  // Specification deleted: Find previously assigned slaves and publish Discovery and State delete outdated discoveries

  private onUpdateSlave(slave: Slave): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let newSlave: boolean = false
      let idx = this.subscribedSlaves.findIndex((s) => 0 == Slave.compareSlaves(s, slave))
      if (idx < 0) {
        debug('Adding to subscribedSlaves: ' + slave.getName())
        this.subscribedSlaves.push(slave)
        newSlave = true
      }

      let busId = slave.getBusId()
      let bus: Bus | undefined = busId != undefined ? Bus.getBus(busId) : undefined
      if (bus) {
        let tAndPs = this.generateDiscoveryEntities(slave)
        if (tAndPs.length == 0) {
          let message = 'No entities found for discovery slave: ' + slave.getSlaveId()
          log.log(LogLevelEnum.error, message)
          reject(new Error(message))
          return
        }
        if (idx >= 0)
          // delete after generateDiscoveryEntities, because entity deletions need to be recognized
          this.subscribedSlaves[idx] = slave

        this.getMqttClient((mqttClient) => {
          log.log(LogLevelEnum.notice, 'Publish Discovery: length:' + tAndPs.length)
          tAndPs.forEach((tAndP) => {
            mqttClient.publish(tAndP.topic, tAndP.payload, retain)
          })
          if (newSlave) this.resubscribe(mqttClient)
        })
        // Wait for discovery
        setTimeout(() => {
          this.readModbusAndPublishState(slave)
            .then(() => {
              resolve()
            })
            .catch(reject)
        }, 500)
      }
    })
  }

  onDeleteBus(busid: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let slaves = new Set<number>()
      let deletions: number[] = []
      let tAndPs: ItopicAndPayloads[] = []
      this.subscribedSlaves.forEach((ss, idx, object) => {
        let sbusId = ss.getBusId()
        if (sbusId == busid) {
          tAndPs.concat(this.generateDiscoveryEntities(ss, true))
          object.splice(idx, 1)
        }
      })
      this.getMqttClient((mqttClient) => {
        tAndPs.forEach((tAndP) => {
          mqttClient.publish(tAndP.topic, tAndP.payload, retain)
        })
        resolve()
      })
    })
  }

  private readModbusAndPublishState(slave: Slave): Promise<ImodbusSpecification> {
    return new Promise<ImodbusSpecification>((resolve, reject) => {
      let obs = MqttDiscover.readModbus(slave)
      if (obs)
        obs.subscribe((spec) => {
          this.publishState(slave, spec)
            .then(() => {
              resolve(spec)
            })
            .catch(reject)
        })
    })
  }
  static readModbus(slave: Slave): Observable<ImodbusSpecification> | undefined {
    let bus = Bus.getBus(slave.getBusId())
    if (bus)
      return Modbus.getModbusSpecification(ModbusTasks.poll, bus, slave.getSlaveId(), slave.getSpecificationId(), (e) => {
        log.log(LogLevelEnum.error, 'reading spec failed' + e.message)
        //Ignore this error continue with next
      })
    return undefined
  }
  private generateQos(slave: Slave, spec?: Ispecification): QoS {
    let qos = slave.getQos()
    if ((qos == undefined || qos == -1) && spec != undefined)
      if (spec.entities.find((e) => e.readonly == false) != undefined) return 1
      else return 0

    return qos ? (qos as QoS) : 1
  }
  private publishState(slave: Slave, spec: ImodbusSpecification): Promise<void> {
    return new Promise<void>((resolve) => {
      debug('publish State aquire mqttClient')
      this.getMqttClient((mqttClient) => {
        debug('publish State executing')
        let topic = slave.getStateTopic()
        let bus = Bus.getBus(slave.getBusId())
        if (this.client && bus && spec) {
          try {
            debug('PublishState')
            mqttClient.publish(topic, slave.getStatePayload(spec.entities), { qos: this.generateQos(slave, spec) })
            mqttClient.publish(slave.getAvailabilityTopic(), 'online', { qos: this.generateQos(slave, spec) })
            resolve()
          } catch (e: any) {
            try {
              mqttClient.publish(slave.getAvailabilityTopic(), 'offline', { qos: this.generateQos(slave, spec) })
            } catch (e: any) {
              // ignore the error
              debug('Error ' + e.message)
            }
          }
        } else {
          if (!this.client) log.log(LogLevelEnum.error, 'No MQTT Client available')
          if (!bus) log.log(LogLevelEnum.error, 'No Bus available')
          if (!spec) log.log(LogLevelEnum.error, 'No Spec available')
        }
      })
    })
  }

  // poll gets triggered every 0.1 second
  // Depending on the pollinterval of the slaves it triggers publication of the current state of the slave
  private poll(): Promise<void> {
    return new Promise<void>((resolve, error) => {
      if (this.isPolling) {
        resolve()
      }
      this.isPolling = true
      let needPolls: {
        slave: Slave
        pollMode: PollModes
      }[] = []

      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((slave) => {
          if (slave.pollMode != PollModes.noPoll) {
            let sl = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
            let pc: number | undefined = this.pollCounts.get(sl.getKey())
            let trigger = this.triggers.find((k) => 0 == Slave.compareSlaves(k.slave, sl))

            if (pc == undefined || pc > (slave.pollInterval != undefined ? slave.pollInterval / 100 : defaultPollCount)) pc = 0
            if (pc == 0 || trigger != undefined) {
              let s = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
              if (slave.specification) {
                needPolls.push({ slave: s, pollMode: trigger == undefined ? PollModes.intervall : PollModes.trigger })
              } else {
                if (slave.specificationid)
                  log.log(
                    LogLevelEnum.error,
                    'No specification found for slave ' + s.getSlaveId() + ' specid: ' + s.getSpecificationId()
                  )
              }
            }
            this.pollCounts.set(sl.getKey(), ++pc)
          }
        })
      })
      if (needPolls.length > 0) {
        let tAndP: ItopicAndPayloads[] = []
        let pollDeviceCount = 0
        needPolls.forEach((bs) => {
          // Trigger state only if it's configured to do so
          let spMode = bs.slave.getPollMode()
          let idx = this.triggers.findIndex((k) => 0 == Slave.compareSlaves(k.slave, bs.slave))
          if (
            spMode == undefined ||
            [PollModes.intervall, PollModes.intervallAndTrigger].includes(spMode) ||
            bs.pollMode == PollModes.trigger ||
            (idx >= 0 && this.triggers[idx].force)
          ) {
            let bus = Bus.getBus(bs.slave.getBusId())
            if (bus)
              Modbus.getModbusSpecification(ModbusTasks.poll, bus, bs.slave.getSlaveId(), bs.slave.getSpecificationId(), (e) => {
                log.log(LogLevelEnum.error, 'reading spec failed' + e.message)
              }).subscribe((spec) => {
                tAndP.push({ topic: bs.slave.getStateTopic(), payload: bs.slave.getStatePayload(spec.entities), entityid: 0 })
                tAndP.push({ topic: bs.slave.getAvailabilityTopic(), payload: 'online', entityid: 0 })
                pollDeviceCount++
                if (pollDeviceCount == needPolls.length)
                  this.getMqttClient((mqttClient) => {
                    debug('poll: publishing')
                    tAndP.forEach((tAndP) => {
                      mqttClient.publish(tAndP.topic, tAndP.payload)
                    })
                    resolve()
                  })
              })
          }
          // Remove trigger
          if (idx >= 0) this.triggers.splice(idx, 1)
        })
      }
    })
  }

  onDeleteSlave(slave: Slave): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let idx = this.subscribedSlaves.findIndex((s) => s.getBaseTopic() == slave.getBaseTopic())
      if (idx >= 0)
        this.getMqttClient((mqttClient) => {
          let tAndPs = this.generateDiscoveryEntities(slave, true)
          this.subscribedSlaves.splice(idx, 1)
          tAndPs.forEach((tAndP) => {
            mqttClient.publish(tAndP.topic, tAndP.payload, retain)
          })
          mqttClient.unsubscribe(slave.getTriggerPollTopic())
          let cmdTopic = slave.getCommandTopic()
          if (cmdTopic) {
            mqttClient.unsubscribe(cmdTopic)
            mqttClient.unsubscribe(slave.getEntityCommandTopicFilter())
          }
          resolve()
        })
    })
  }

  startPolling() {
    if (this.interval == undefined) {
      this.interval = setInterval(() => {
        this.poll()
          .then(() => {})
          .catch(this.error)
      }, 100)
    }
  }
}
