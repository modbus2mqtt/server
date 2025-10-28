import { Config } from '../../src/server/config'
import {
  ImodbusEntity,
  ModbusRegisterType,
} from '../../src/specification.shared'
import { ItopicAndPayloads, MqttDiscover } from '../../src/server/mqttdiscover'
import {
  MqttClient,
} from 'mqtt'
import { FakeModes, FakeMqtt, initBussesForTest, setConfigsDirsForTest
 } from './configsbase'
import { Bus } from '../../src/server/bus'
import Debug from 'debug'
import { ConfigSpecification } from '../../src/specification'
import { expect, test, beforeAll } from '@jest/globals'
import { Islave, Slave } from '../../src/server.shared'
import { ConfigBus } from '../../src/server/configbus'
import { MqttConnector } from '../../src/server/mqttconnector'
import { MqttPoller } from '../../src/server/mqttpoller'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions'
const debug = Debug('mqttdiscover_test')

const topic4Deletion = {
  topic: 'homeassistant/sensor/1s0/e1/topic4Deletion',
  payload: '',
  entityid: 1,
}
class MdFakeMqtt extends FakeMqtt {
  public override publish(topic: string, message: Buffer): void {
    if (topic.endsWith('/availabitlity/')) {
      debug('publish ' + topic + '\n' + message)
    } else if (topic.endsWith('/state/')) {
      // a state topic
      switch (this.fakeMode) {
        case FakeModes.Poll:
          expect(message.length).not.toBe(0)
          this.isAsExpected = true
          break
      }
    }
    debug('publish: ' + topic + '\n' + message)
  }
}

let slave: Islave
const selectTestId = 3
const numberTestId = 4
const selectTestWritableId = 5
let msub1: MqttSubscriptions
let selectTest: ImodbusEntity = {
  id: selectTestWritableId,
  mqttname: 'selecttestWr',
  modbusAddress: 7,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  converter: 'select',
  modbusValue: [],
  mqttValue: '300',
  identified: 1,
  converterParameters: { optionModbusValues: [1, 2, 3] },
}

let selectTestWritable: ImodbusEntity = {
  id: selectTestId,
  mqttname: 'selecttest',
  modbusAddress: 1,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: false,
  converter: 'select',
  modbusValue: [],
  mqttValue: '300',
  identified: 1,
  converterParameters: { optionModbusValues: [1, 2, 3] },
}

interface IfakeDiscovery {
  conn: MqttConnector
  mdl: MqttPoller
  msub: MqttSubscriptions
  md: MqttDiscover
  fake: FakeMqtt
}

function getFakeDiscovery(): IfakeDiscovery {
  let conn = new MqttConnector()
  let msub = new MqttSubscriptions(conn)
  let rc: IfakeDiscovery = {
    conn: conn,
    mdl: new MqttPoller(conn),
    msub: msub,
    md: new MqttDiscover(conn, msub),
    fake: new FakeMqtt(msub, FakeModes.Poll),
  }
  rc.conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(rc.fake as any as MqttClient)
  }
  return rc
}
let fakeDiscovery: IfakeDiscovery

function copySubscribedSlaves(toA: Slave[], fromA: Slave[]) {
  fromA.forEach((s) => {
    ConfigBus.addSpecification(s['slave'])
    if (s['slave'] && s['slave'].specification && s['slave'].specification.entities)
      s['slave'].specification.entities.forEach((e: any) => {
        e.converter = 'select'
      })
    toA.push(s.clone())
  })
}
beforeAll((done) => {
  // Fix ModbusCache ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  setConfigsDirsForTest();
  Config['config'] = {} as any
  let readConfig: Config = new Config()
  readConfig.readYamlAsync().then(() => {
    fakeDiscovery = getFakeDiscovery()
    initBussesForTest()
    done()
  })
})

test('poll', (done) => {
  let fd = getFakeDiscovery()
  copySubscribedSlaves(fd.msub['subscribedSlaves'], fakeDiscovery.msub['subscribedSlaves'])
  fd.mdl['poll']!(Bus.getBus(0)!).then(() => {
    expect(fd.fake.isAsExpected).toBeTruthy()
    expect(fd.mdl!['slavePollInfo'].size).toBeGreaterThan(0)
    let c = fd.mdl!['slavePollInfo'].values().next()
    expect(c.value!.count).toBeGreaterThan(0)
    fd.fake = new FakeMqtt(fd.msub!, FakeModes.Poll2)
    // second call should do nothing, because interval is too short
    fd.conn['client'] = fd.fake as any as MqttClient
    fd.fake.isAsExpected = true
    let m = new Map<number, ItopicAndPayloads>()
    m.set(1, topic4Deletion)
    let sl = new Slave(1, { slaveid: 0 }, Config.getConfiguration().mqttbasetopic)
    expect(fd.msub['subscribedSlaves'].length).toBeGreaterThan(3)
    fd.msub['subscribedSlaves'].push(sl)
    expect(fd.msub['subscribedSlaves'].length).toBeGreaterThan(3)
    fd.mdl!['poll'](Bus.getBus(0)!).then(() => {
      expect(fd.fake.isAsExpected).toBeTruthy()
      let c = fd.mdl!['slavePollInfo'].values().next()
      fd.mdl!['slavePollInfo'].set(1, { count: 10000, processing: false })
      expect(c.value!.count).toBeGreaterThan(1)
      //call discovery explicitely
      // Expectation: It should not publish anything, because this has happened already
      let bus = Bus.getBus(0)
      fd.fake.isAsExpected = false
      fd.fake.fakeMode = FakeModes.Discovery
      let slave = bus?.getSlaveBySlaveId(1)
      fd.mdl!['poll'](Bus.getBus(0)!).then(() => {
        let ss = fd.msub['subscribedSlaves'].find((s) => Slave.compareSlaves(s, sl) == 0)
        done()
      })
    })
  })
})

test('poll with processing=true for all slaves', (done) => {
  let fd = getFakeDiscovery()
  initBussesForTest()
  fd.mdl!['slavePollInfo'].set(1, { count: 0, processing: true })
  fd.mdl!['slavePollInfo'].set(2, { count: 0, processing: true })
  fd.mdl!['slavePollInfo'].set(3, { count: 0, processing: true })
  fd.fake.isAsExpected = false
  fd.mdl!['poll']!(Bus.getBus(0)!).then(() => {
    expect(fd.mdl!['slavePollInfo'].get(1)!.processing).toBeTruthy()
    expect(fd.fake.isAsExpected).toBeFalsy()
    done()
  })
})

test('poll with processing= true for first Slave', (done) => {
  let fd = getFakeDiscovery()
  fd.mdl!['slavePollInfo'].set(1, { count: 0, processing: true })
  fd.mdl!['slavePollInfo'].set(2, { count: 0, processing: false })
  fd.mdl!['slavePollInfo'].set(3, { count: 0, processing: false })
  fd.fake.isAsExpected = false
  fd.mdl!['poll']!(Bus.getBus(0)!).then(() => {
    expect(fd.mdl!['slavePollInfo'].get(1)!.processing).toBeTruthy()
    expect(fd.fake.isAsExpected).toBeTruthy()
    done()
  })
})
