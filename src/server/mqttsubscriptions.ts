import { Slave, PollModes, ModbusTasks, Islave } from '../server.shared'
import Debug from 'debug'
import { ConfigSpecification, ConverterMap, LogLevelEnum, Logger } from '../specification'
import { Bus } from './bus'
import { Config } from './config'
import { Modbus } from './modbus'
import { ItopicAndPayloads, MqttDiscover } from './mqttdiscover'
import { MqttConnector } from './mqttconnector'
import { Ientity, ImodbusSpecification } from '../specification.shared'
import { Converter } from '../specification'
import { Observable } from 'rxjs'
import { MqttClient } from 'mqtt'

const debug = Debug('mqttsubscription')
const log = new Logger('mqttsubscription')
const modbusValues = 'modbusValues'

export class MqttSubscriptions {
  private subscribedSlaves: Slave[] = []
  constructor(private connector: MqttConnector) {
    this.connector.addOnConnectListener(this.resubscribe.bind(this))
    this.connector.addOnMqttMessageListener(this.onMqttMessage.bind(this))
  }
  private static instance: MqttSubscriptions | undefined = undefined

  static getInstance(): MqttSubscriptions {
    if (MqttSubscriptions.instance) return MqttSubscriptions.instance

    MqttSubscriptions.instance = new MqttSubscriptions(MqttConnector.getInstance())

    return MqttSubscriptions.instance
  }
  // bus/slave name:entity id:payload
  getSlaveBaseTopics(): string[] {
    return this.subscribedSlaves.map<string>((value) => value.getBaseTopic())
  }
  getSlave(topic: string): Slave | undefined {
    return this.subscribedSlaves.find((value) => topic.startsWith(value.getBaseTopic()))
  }
  private onMqttCommandMessage(topic: string, payload: Buffer): string {
    try {
      let busAndSlave = MqttSubscriptions.getBusAndSlaveFromTopic(topic)
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
                  busAndSlave.bus.getModbusAPI(),
                  busAndSlave.slave.slaveid,
                  entity,
                  JSON.parse(payload.toString())
                )
              else
                promise = Modbus.writeEntityMqtt(
                  busAndSlave.bus.getModbusAPI(),
                  busAndSlave.slave.slaveid,
                  spec,
                  entity.id,
                  payload.toString()
                )
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
        return Modbus.writeEntityModbus(Bus.getBus(slave.getBusId())!.getModbusAPI(), slave.getSlaveId(), entity, [
          Number.parseInt(payload),
        ])
      else {
        let spec = ConfigSpecification.getSpecificationByFilename(slave.getSpecificationId())
        if (spec)
          return Modbus.writeEntityMqtt(
            Bus.getBus(slave.getBusId())!.getModbusAPI(),
            slave.getSlaveId(),
            spec,
            entity.id,
            payload.toString()
          )
      }
    }
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('No Converter or spec found for spec/entity ' + slave.getSpecificationId() + '/' + entity.mqttname))
    })
  }

  sendEntityCommandWithPublish(slave: Slave, topic: string, payload: string): Promise<ImodbusSpecification> {
    let entity = slave.getEntityFromCommandTopic(topic)
    if (entity && !entity.readonly)
      return new Promise<ImodbusSpecification>((resolve, reject) => {
        this.sendEntityCommand(slave, topic, payload.toString())
          .then(() => {
            this.publishState(slave).then(resolve).catch(reject)
          })
          .catch(reject)
      })
    log.log(LogLevelEnum.error, 'No writable entity found for topic ' + topic)
    return new Promise<ImodbusSpecification>((_resolve, reject) => {
      reject(new Error('No writable entity found for topic ' + topic))
    })
  }
  sendEntityCommand(slave: Slave, topic: string, payload: string): Promise<void> {
    let entity = slave.getEntityFromCommandTopic(topic)
    if (entity && !entity.readonly) return this.sendCommandModbus(slave, entity, topic.endsWith('/set/modbus/'), payload.toString())
    log.log(LogLevelEnum.error, 'No writable entity found for topic ' + topic)
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('No writable entity found for topic ' + topic))
    })
  }
  publishState(slave: Slave): Promise<ImodbusSpecification> {
    return new Promise<ImodbusSpecification>((resolve, reject) => {
      let obs = MqttSubscriptions.readModbus(slave)
      if (obs)
        obs.subscribe((spec) => {
          this.publishStateLocal(slave, spec)
            .then(() => {
              resolve(spec)
            })
            .catch(reject)
        })
    })
  }
  static readModbus(slave: Slave): Observable<ImodbusSpecification> | undefined {
    let bus = Bus.getBus(slave.getBusId())
    if (bus) {
      let s = bus.getSlaveBySlaveId(slave.getSlaveId()!)
      return Modbus.getModbusSpecification(ModbusTasks.poll, bus.getModbusAPI(), s!, slave.getSpecificationId(), (e) => {
        log.log(LogLevelEnum.error, 'reading spec failed' + e.message)
        //Ignore this error continue with next
      })
    }
    return undefined
  }
  private publishStateLocal(slave: Slave, spec: ImodbusSpecification): Promise<void> {
    return new Promise<void>((resolve) => {
      debug('publish State aquire mqttClient')
      this.connector.getMqttClient((mqttClient) => {
        debug('publish State executing')
        let topic = slave.getStateTopic()
        let bus = Bus.getBus(slave.getBusId())
        if (mqttClient && bus && spec) {
          try {
            debug('PublishState')
            mqttClient.publish(topic, slave.getStatePayload(spec.entities), { qos: MqttDiscover.generateQos(slave, spec) })
            mqttClient.publish(slave.getAvailabilityTopic(), 'online', { qos: MqttDiscover.generateQos(slave, spec) })
            resolve()
          } catch (e: any) {
            try {
              mqttClient.publish(slave.getAvailabilityTopic(), 'offline', { qos: MqttDiscover.generateQos(slave, spec) })
            } catch (e: any) {
              // ignore the error
              debug('Error ' + e.message)
            }
          }
        } else {
          if (!mqttClient) log.log(LogLevelEnum.error, 'No MQTT Client available')
          if (!bus) log.log(LogLevelEnum.error, 'No Bus available')
          if (!spec) log.log(LogLevelEnum.error, 'No Spec available')
        }
      })
    })
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
          this.publishState(slave).then(resolve).catch(reject)
        })
      else reject(new Error('No writable entity found in payload ' + payload))
    })
  }
  private containsTopic(tp: ItopicAndPayloads, tps: ItopicAndPayloads[]) {
    let t = tps.findIndex((t) => tp.topic === t.topic)
    return -1 != t
  }
  getSubscribedSlave(slave: Slave | undefined): Slave | undefined {
    if (slave == undefined) return undefined
    return this.subscribedSlaves.find((s) => 0 == Slave.compareSlaves(s, slave))
  }
  addSubscribedSlave(newSlave: Slave): boolean {
    let s: Slave | undefined = undefined
    let idx = -1
    idx = this.subscribedSlaves.findIndex((s) => 0 == Slave.compareSlaves(s, newSlave))
    if (idx < 0) {
      debug('Adding to subscribedSlaves: ' + newSlave.getName())
      this.subscribedSlaves.push(newSlave)
      return true
    }
    return false
  }
  updateSubscribedSlave(slave: Slave, newSlave: Slave): void {
    let s: Slave | undefined = undefined
    let idx = -1
    idx = this.subscribedSlaves.findIndex((s) => 0 == Slave.compareSlaves(s, slave))
    if (idx < 0) {
      debug('Adding to subscribedSlaves: ' + newSlave.getName())
      this.subscribedSlaves.push(newSlave)
    } else this.subscribedSlaves[idx] = newSlave
  }
  deleteSubscribedSlave(slave: Slave | undefined, mqttClient?: MqttClient): void {
    if (!slave) return

    let idx = this.subscribedSlaves.findIndex((s) => 0 == Slave.compareSlaves(s, slave))
    if (idx >= 0) {
      this.subscribedSlaves.splice(idx, 1)
    }
    let fct = (mqttClient: MqttClient) => {
      mqttClient.unsubscribe(slave.getTriggerPollTopic())
      let cmdTopic = slave.getCommandTopic()
      if (cmdTopic) {
        mqttClient.unsubscribe(cmdTopic)
        mqttClient.unsubscribe(slave.getEntityCommandTopicFilter())
      }
    }
    if (mqttClient) fct(mqttClient)
    else
      MqttConnector.getInstance().getMqttClient((mqttClient) => {
        fct(mqttClient)
      })
  }

  getSubscribedSlavesForBus(busid: number): Slave[] {
    let s: Slave | undefined = undefined
    return this.subscribedSlaves.filter((s) => s.getBusId() == busid)
  }
  // returns a promise for testing
  private onMqttMessage(topic: string, payload: Buffer): Promise<void> {
    if (topic) {
      debug('onMqttMessage: ' + topic)
      let s = this.subscribedSlaves.find((s) => topic.startsWith(s.getBaseTopic()!))
      if (s) {
        if (s.getTriggerPollTopic() == topic) {
          debug('Triggering Poll')
          return this.publishState(s) as any as Promise<void>
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

  resubscribe(mqttClient: MqttClient): void {
    this.subscribedSlaves.forEach((slave) => {
      let options = { qos: MqttDiscover.generateQos(slave, slave.getSpecification()) }
      mqttClient.subscribe(slave.getTriggerPollTopic(), options)
      let cmdTopic = slave.getCommandTopic()
      if (cmdTopic) {
        mqttClient.subscribe(cmdTopic, options)
        mqttClient.subscribe(slave.getEntityCommandTopicFilter(), options)
      }
    })
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
}
