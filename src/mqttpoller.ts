import { Slave, PollModes, ModbusTasks, Islave } from '@modbus2mqtt/server.shared'
import Debug from 'debug'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import { Bus } from './bus'
import { Config } from './config'
import { Modbus } from './modbus'
import { ItopicAndPayloads, MqttDiscover } from './mqttdiscover'
import { MqttConnector } from './mqttconnector'

const debug = Debug('mqttpoller')
const defaultPollCount = 50 // 5 seconds
const log = new Logger('mqttpoller')
interface IslavePollInfo {
  count: number
  processing: boolean
}
export class MqttPoller {
  interval: NodeJS.Timeout | undefined
  private lastMessage: string = ''
  private slavePollInfo: Map<number, IslavePollInfo> = new Map<number, IslavePollInfo>()

  constructor(private connector: MqttConnector) {}

  // poll gets triggered every 0.1 second
  // Depending on the pollinterval of the slaves it triggers publication of the current state of the slave
  private poll(bus: Bus): Promise<void> {
    return new Promise<void>((resolve, error) => {
      let needPolls: Slave[] = []

      bus.getSlaves().forEach((slave) => {
        if (slave.pollMode != undefined && ![PollModes.noPoll, PollModes.trigger].includes(slave.pollMode)) {
          let sl = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
          let pc: IslavePollInfo | undefined = this.slavePollInfo.get(sl.getSlaveId())
          if (pc == undefined) pc = { count: 0, processing: false }
          if (pc.count > (slave.pollInterval != undefined ? slave.pollInterval / 100 : defaultPollCount)) pc.count = 0
          if (pc.count == 0 && !pc.processing) {
            let s = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
            if (slave.specification) {
              pc.processing = true
              needPolls.push(s)
            } else {
              if (slave.specificationid)
                log.log(
                  LogLevelEnum.error,
                  'No specification found for slave ' + s.getSlaveId() + ' specid: ' + s.getSpecificationId()
                )
            }
          }
          this.slavePollInfo.set(sl.getSlaveId(), { count: ++pc.count, processing: pc.processing })
        }
      })
      if (needPolls.length > 0) {
        let tAndP: ItopicAndPayloads[] = []
        let pollDeviceCount = 0
        needPolls.forEach((bs) => {
          // Trigger state only if it's configured to do so
          let spMode = bs.getPollMode()
          if (spMode == undefined || [PollModes.intervall, PollModes.intervallAndTrigger].includes(spMode)) {
            if (bus) {
              let slave = bus.getSlaveBySlaveId(bs.getSlaveId())!
              Modbus.getModbusSpecification(ModbusTasks.poll, bus.getModbusAPI(), slave, bs.getSpecificationId(), (e) => {
                log.log(LogLevelEnum.error, 'reading spec failed' + e.message)
              }).subscribe((spec) => {
                tAndP.push({ topic: bs.getStateTopic(), payload: bs.getStatePayload(spec.entities), entityid: 0 })
                tAndP.push({ topic: bs.getAvailabilityTopic(), payload: 'online', entityid: 0 })
                pollDeviceCount++
                if (pollDeviceCount == needPolls.length)
                  this.connector.getMqttClient((mqttClient) => {
                    debug('poll: publishing')
                    tAndP.forEach((tAndP) => {
                      mqttClient.publish(tAndP.topic, tAndP.payload)
                    })
                    needPolls.forEach((v) => {
                      let si = this.slavePollInfo.get(v.getSlaveId())
                      if (si) si.processing = false
                    })
                    resolve()
                  })
              })
            }
          }
        })
      } else resolve()
    })
  }

  startPolling(bus: Bus) {
    if (this.interval == undefined) {
      this.interval = setInterval(() => {
        this.poll(bus)
          .then(() => {})
          .catch(this.error)
      }, 100)
    }
  }
  private error(msg: any): void {
    let message = "MQTT: Can't connect to " + Config.getConfiguration().mqttconnect.mqttserverurl + ' ' + msg.toString()
    if (message !== this.lastMessage) log.log(LogLevelEnum.error, message)
    this.lastMessage = message
  }
}
