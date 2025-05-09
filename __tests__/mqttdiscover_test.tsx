import { Config } from '../src/config'
import {
  IbaseSpecification,
  Ientity,
  ImodbusEntity,
  ImodbusSpecification,
  Ispecification,
  ModbusRegisterType,
  SpecificationStatus,
  VariableTargetParameters,
} from '@modbus2mqtt/specification.shared'
import { ItopicAndPayloads, MqttDiscover } from '../src/mqttdiscover'
import {
  Client,
  ClientSubscribeCallback,
  IClientSubscribeOptions,
  IClientSubscribeProperties,
  ISubscriptionMap,
  MqttClient,
} from 'mqtt'
import { submitGetHoldingRegisterRequest } from '../src/submitRequestMock'
import { FakeModes, FakeMqtt, initBussesForTest, yamlDir } from './configsbase'
import { Bus } from '../src/bus'
import Debug from 'debug'
import { ConfigSpecification, Logger } from '@modbus2mqtt/specification'
import { expect, test, afterAll, beforeAll, jest, xtest, beforeEach } from '@jest/globals'
import exp from 'constants'
import { Islave, Slave } from '@modbus2mqtt/server.shared'
import { ConfigBus } from '../src/configbus'
import { Modbus } from '../src/modbus'
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

let oldLog: any
let slave: Islave
let spec: ImodbusSpecification
const selectTestId = 3
const numberTestId = 4
const selectTestWritableId = 5
let md: MqttDiscover
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

beforeAll((done) => {
  // Fix ModbusCache ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  oldLog = Logger.prototype.log
  Config['yamlDir'] = yamlDir
  Config['config'] = {} as any
  ConfigSpecification.yamlDir = yamlDir
  Config.sslDir = yamlDir
  initBussesForTest()
  md = MqttDiscover.getInstance()
  let fake = new FakeMqtt(md, FakeModes.Poll)
  md['client'] = fake as any as MqttClient
  md['connectMqtt'] = function (undefined) {
    md['onConnect'](md['client']!)
  }

  let readConfig: Config = new Config()
  readConfig.readYamlAsync().then(() => {
    Config.setFakeModbus(true)
    new ConfigSpecification().readYaml()
    ConfigBus.readBusses()
    let bus = Bus.getBus(0)
    spec = {} as ImodbusSpecification
    slave = {
      specificationid: 'deye',
      slaveid: 2,
      pollInterval: 100,
    }

    let serialNumber: ImodbusEntity = {
      id: 0,
      mqttname: 'serialnumber',
      variableConfiguration: {
        targetParameter: VariableTargetParameters.deviceIdentifiers,
      },
      converter: 'text',
      modbusValue: [],
      mqttValue: '123456',
      identified: 1,
      converterParameters: { stringlength: 12 },
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: false,
      modbusAddress: 2,
    }
    let currentSolarPower: ImodbusEntity = {
      id: 1,
      mqttname: 'currentpower',
      converter: 'number',
      modbusValue: [],
      mqttValue: '300',
      identified: 1,
      converterParameters: { uom: 'kW' },
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      modbusAddress: 2,
    }
    spec.filename = 'deye'
    spec.manufacturer = 'Deye'
    spec.model = 'SUN-10K-SG04LP3-EU'
    spec.i18n = [{ lang: 'en', texts: [] }]
    spec.i18n[0].texts = [
      { textId: 'name', text: 'Deye Inverter' },
      { textId: 'e1', text: 'Current Power' },
      { textId: 'e3', text: 'Select Test' },
      { textId: 'e3o.1', text: 'Option 1' },
      { textId: 'e3o.2', text: 'Option 2' },
      { textId: 'e3o.3', text: 'Option 3' },
      { textId: 'e5', text: 'Select Test' },
      { textId: 'e5o.1', text: 'Option 1' },
      { textId: 'e5o.2', text: 'Option 2' },
      { textId: 'e5o.3', text: 'Option 3' },
    ]
    spec.entities = []
    spec.entities.push(serialNumber)
    spec.entities.push(currentSolarPower)
    spec.entities.push(selectTest)
    slave.specification = spec as any
    new ConfigSpecification().writeSpecification(spec as any, () => {}, spec.filename)
    bus!.writeSlave(slave)

    done()
  })
})
let numberTest: ImodbusEntity = {
  id: numberTestId,
  mqttname: 'mqtt',
  modbusAddress: 2,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  converter: 'number',
  modbusValue: [],
  mqttValue: '300',
  identified: 1,
  converterParameters: { multiplier: 1, offset: 0, uom: 'kW' },
}

var tps: ItopicAndPayloads[] = []
function spyMqttOnMessage(ev: string, _cb: Function): MqttClient {
  if (ev === 'message') {
    for (let tp of tps) {
      md!['onMqttMessage'](tp.topic, Buffer.from(tp.payload as string, 'utf8'))
    }
  }
  return md!['client'] as MqttClient
}

test('Discover', (done) => {
  expect(md['subscribedSlaves'].length).toBeGreaterThan(3)

  Config['config'].mqttusehassio = false
  new Config().getMqttConnectOptions().then((options) => {
    let s = structuredClone(spec)
    s.entities.push(selectTestWritable)

    let payloads: ItopicAndPayloads[] = md['generateDiscoveryPayloads'](
      new Slave(0, slave, Config.getConfiguration().mqttbasetopic),
      s
    )
    expect(payloads.length).toBe(3)
    let payloadCurrentPower = JSON.parse(payloads[0].payload as string)
    let payloadSelectTestPower = JSON.parse(payloads[1].payload as string)
    expect(payloadCurrentPower.name).toBe('Current Power')
    expect(payloadCurrentPower.unit_of_measurement).toBe('kW')
    expect(payloadSelectTestPower.device.name).toBe('Deye Inverter')
    expect(payloadSelectTestPower.name).toBe('Select Test')
    expect(payloadSelectTestPower.options).not.toBeDefined()
    expect(payloads[1].topic.indexOf('/sensor/')).toBeGreaterThan(0)
    let payloadSelectTestWritable = JSON.parse(payloads[2].payload as string)
    expect(payloads[2].topic.indexOf('/select/')).toBeGreaterThan(0)
    expect(payloadSelectTestWritable.device_class).toBe('enum')
    expect(payloadSelectTestWritable.options).toBeDefined()
    expect(payloadSelectTestWritable.options.length).toBeGreaterThan(0)
    expect(payloadSelectTestWritable.command_topic).toBeDefined()
    let pl = JSON.parse(payloads[0].payload as string)
    //expect(pl.unit_of_measurement).toBe("kW");
    expect(pl.device.manufacturer).toBe(spec.manufacturer)
    expect(pl.device.model).toBe(spec.model)
    done()
  })
})
// test("pollIntervallToMilliSeconds", (done) => {
//     new Config().getMqttConnectOptions().then((options) => {
//         let md = new MqttDiscover(options,"en");
//         expect(md['pollIntervallToMilliSeconds']("5 min") as any).toBe(5 * 60 * 1000);
//         expect(md['pollIntervallToMilliSeconds']("5 sec") as any).toBe(5 * 1000);
//         expect(md['pollIntervallToMilliSeconds']("15 sec") as any).toBe(15 * 1000);
//         done();
//     });

// });
xtest('validateConnection success', (done) => {
  let options = Config.getConfiguration().mqttconnect

  let md = new MqttDiscover()
  md.validateConnection(undefined, (valid, message) => {
    expect(valid).toBeTruthy()
    done()
  })
})

xtest('validateConnection invalid port', (done) => {
  let options = Config.getConfiguration().mqttconnect
  options.mqttserverurl = 'mqtt://localhost:999'
  options.connectTimeout = 200
  md.validateConnection(undefined, (valid, message) => {
    expect(valid).toBeFalsy()
    done()
  })
})
xtest('onMqttConnect', (_done) => {
  /*  
  Config.setFakeModbus(true)
  Config['config'].mqttusehassio = false
  new Config().getMqttConnectOptions().then((options) => {
    md = new MqttDiscover(options, 'en')
    jest.mock('mqtt')
    let c: MqttClient = Object.create(Client.prototype)
    c.connected = true
    md['client'] = c
    // subscribe to discovery for one device
    const mockPublish = jest.fn((_topic: string, _payload: string | Buffer) => c)
    const mockMqttUnsubscribe = jest.fn((_topic: string | string[]) => c)
    const mockSubscribe = jest.fn(
      (
        _topic: string | string[] | ISubscriptionMap,
        opts?: IClientSubscribeOptions | IClientSubscribeProperties | undefined,
        _callback?: ClientSubscribeCallback | undefined
      ) => c
    )
    tps = md['generateDiscoveryPayloads'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic), spec)
    jest.spyOn(c, 'subscribe').mockImplementation(mockSubscribe)
    jest.spyOn(c, 'publish').mockImplementation(mockPublish)
    jest.spyOn(c, 'on').mockImplementation(spyMqttOnMessage)
    jest.spyOn(c, 'unsubscribe').mockImplementation(mockMqttUnsubscribe)
    md['publishDiscoveryForSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic), spec).then(() => {
      expect(c.publish).toHaveBeenCalledTimes(2)
      spec.entities.push(numberTest)
      md!['publishDiscoveryForSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic), spec).then(() => {
        expect(c.publish).toHaveBeenCalledTimes(5)
        tps = md!['generateDiscoveryPayloads'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic), spec)
        spec.entities.splice(-1)
        md!['publishDiscoveryForSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic), spec).then(() => {
          expect(c.publish).toHaveBeenCalledTimes(7)
          tps = md!['generateDiscoveryPayloads'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic), spec)
          md!['publishDiscoveryForSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic), spec).then(() => {
            expect(c.publish).toHaveBeenCalledTimes(9)
            done()
          })
        })
      })
    })
  })
    */
})

test('selectConverter adds modbusValue to statePayload', () => {
  expect(md['subscribedSlaves'].length).toBeGreaterThan(3)
  let specEntity: ImodbusEntity = {
    id: 1,
    modbusValue: [3],
    mqttValue: 'Some Text',
    identified: 1,
    mqttname: 'selectTest',
    converter: 'select',
    readonly: false,
    registerType: ModbusRegisterType.HoldingRegister,
    modbusAddress: 44,
    converterParameters: {
      options: [{ key: 3, name: 'Some Text' }],
    },
  }
  let spec: ImodbusSpecification = { entities: [specEntity] } as any as ImodbusSpecification
  let sl = new Slave(0, { slaveid: 0 }, Config.getConfiguration().mqttbasetopic)
  sl.getStatePayload(spec.entities)
  let payload = JSON.parse(sl.getStatePayload(spec.entities))
  expect(payload.modbusValues).toBeDefined()
  expect(payload.modbusValues.selectTest).toBe(3)
})
test('onCommandTopic', () => {
  Config.setFakeModbus(true)
  Config['config'].mqttusehassio = false
  let rc = md['onMqttCommandMessage']('m2m/set/0s1/e1/modbusValues', Buffer.from('[3]', 'utf8'))
  expect(rc).toBe('Modbus [3]')
})

test('poll', (done) => {
  let mdl = new MqttDiscover()
  let fake = new FakeMqtt(md, FakeModes.Poll)
  mdl['client'] = fake as any as MqttClient
  mdl['connectMqtt'] = function (undefined) {
    mdl['onConnect'](mdl['client']!)
  }
  copySubscribedSlaves(mdl['subscribedSlaves'], md['subscribedSlaves'])
  mdl['poll']().then(() => {
    expect(fake.isAsExpected).toBeTruthy()
    expect(mdl['pollCounts'].size).toBeGreaterThan(0)
    let c = mdl['pollCounts'].values().next()
    expect(c.value).toBeGreaterThan(0)
    fake = new FakeMqtt(md!, FakeModes.Poll2)
    // second call should do nothing, because interval is too short
    mdl['client'] = fake as any as MqttClient
    fake.isAsExpected = true
    let m = new Map<number, ItopicAndPayloads>()
    m.set(1, topic4Deletion)
    let sl = new Slave(1, { slaveid: 0 }, Config.getConfiguration().mqttbasetopic)
    expect(md['subscribedSlaves'].length).toBeGreaterThan(3)
    mdl['subscribedSlaves'].push(sl)
    expect(mdl['subscribedSlaves'].length).toBeGreaterThan(3)
    mdl['poll']().then(() => {
      expect(fake.isAsExpected).toBeTruthy()
      let c = mdl['pollCounts'].values().next()
      mdl['pollCounts'].set(new Slave(0, { slaveid: 1 }, Config.getConfiguration().mqttbasetopic).getKey(), 10000)
      expect(c.value).toBeGreaterThan(1)
      //call discovery explicitely
      // Expectation: It should not publish anything, because this has happened already
      let bus = Bus.getBus(0)
      fake.isAsExpected = false
      fake.fakeMode = FakeModes.Discovery
      let slave = bus?.getSlaveBySlaveId(1)
      mdl['poll']().then(() => {
        let ss = mdl!['subscribedSlaves'].find((s) => Slave.compareSlaves(s, sl) == 0)
        done()
      })
    })
  })
})
function getTopicCount(md: MqttDiscover): number {
  let sum = 0
  let ss = md!['subscribedSlaves'].forEach((sl) => {
    //TODO sum += sl.discoveryTopicAndPayload.size
  })
  return sum
}
test('onMessage TriggerPollTopic from this app', (done) => {
  expect(md['subscribedSlaves'].length).toBeGreaterThan(3)

  let mdl = new MqttDiscover()
  let fake = new MdFakeMqtt(mdl, FakeModes.Poll)
  mdl['client'] = fake as any as MqttClient
  mdl['connectMqtt'] = function (undefined) {
    mdl['onConnect'](mdl['client']!)
  }
  copySubscribedSlaves(mdl['subscribedSlaves'], md['subscribedSlaves'])
  let sl = new Slave(0, { slaveid: 3 }, Config.getConfiguration().mqttbasetopic)
  fake.fakeMode = FakeModes.Poll
  mdl['onMqttMessage'](sl.getTriggerPollTopic(), Buffer.from(' '))
    .then(() => {
      // expect a state topic (FakeModes.Poll)
      expect(fake.isAsExpected).toBeTruthy()
      done()
    })
    .catch((e) => {
      console.log('Error' + e.message)
      expect(false).toBeTruthy()
      done()
    })
})

class FakeMqttSendCommandTopic extends FakeMqtt {
  public override publish(topic: string, message: Buffer): void {
    if (topic.endsWith('/state/')) {
      expect(message.length).not.toBe(0)
      this.isAsExpected = true
    }
    debug('publish: ' + topic + '\n' + message)
  }
}
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
test('onMessage SendEntityCommandTopic from this app', (done) => {
  expect(md['subscribedSlaves'].length).toBeGreaterThan(3)
  let mdl = new MqttDiscover()
  copySubscribedSlaves(mdl['subscribedSlaves'], md['subscribedSlaves'])
  let fake = new FakeMqttSendCommandTopic(mdl, FakeModes.Poll)
  mdl['client'] = fake as any as MqttClient
  mdl['connectMqtt'] = function (undefined) {
    mdl['onConnect'](mdl['client']!)
  }
  let bus = Bus.getBus(0)
  let slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  ;(slave!.specification?.entities[2] as any).converter = 'select'
  let spec = slave!.specification!
  let sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  slave!.specification!.entities[2].readonly = false
  let oldwriteEntityMqtt = Modbus.writeEntityMqtt
  let writeEntityMqttMock = jest.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityMqtt = writeEntityMqttMock as any
  let en: any = spec!.entities[2]
  mdl['onMqttMessage'](sl.getEntityCommandTopic(en)!.commandTopic!, Buffer.from('20.2'))
    .then(() => {
      expect(fake.isAsExpected).toBeTruthy()
      expect(writeEntityMqttMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt

      done()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
      done()
    })
})
test('onMessage SendCommandTopic from this app', (done) => {
  expect(md['subscribedSlaves'].length).toBeGreaterThan(3)
  let mdl = new MqttDiscover()
  let fake = new FakeMqttSendCommandTopic(mdl, FakeModes.Poll)
  mdl['client'] = fake as any as MqttClient
  let oldwriteEntityMqtt = Modbus.writeEntityMqtt
  let writeEntityMqttMock = jest.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityMqtt = writeEntityMqttMock as any

  mdl['connectMqtt'] = function (undefined) {
    mdl['onConnect'](mdl['client']!)
  }
  let bus = Bus.getBus(0)
  let slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  copySubscribedSlaves(mdl['subscribedSlaves'], md['subscribedSlaves'])

  let sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  slave!.specification!.entities[2].readonly = false
  mdl['onMqttMessage'](sl.getCommandTopic()!, Buffer.from('{ "hotwatertargettemperature": 20.2 }'))
    .then(() => {
      expect(writeEntityMqttMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt

      expect(fake.isAsExpected).toBeTruthy()
      done()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
      done()
    })
})
test('onMessage SendCommand with modbusValues', (done) => {
  expect(md['subscribedSlaves'].length).toBeGreaterThan(3)
  let mdl = new MqttDiscover()
  copySubscribedSlaves(mdl['subscribedSlaves'], md['subscribedSlaves'])
  let fake = new FakeMqttSendCommandTopic(mdl, FakeModes.Poll)
  mdl['client'] = fake as any as MqttClient
  let oldwriteEntityMqtt = Modbus.writeEntityMqtt
  let writeEntityModbusMock = jest.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityModbus = writeEntityModbusMock as any

  mdl['connectMqtt'] = function (undefined) {
    mdl['onConnect'](mdl['client']!)
  }
  let bus = Bus.getBus(0)
  let slave = structuredClone(bus!.getSlaveBySlaveId(1))
  let sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  mdl['onMqttMessage'](sl.getCommandTopic()!, Buffer.from('{ "modbusValues": { "operatingmode": 2 }}'))
    .then(() => {
      expect(writeEntityModbusMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt

      expect(fake.isAsExpected).toBeTruthy()
      done()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
      done()
    })
})
class FakeMqttAddSlaveTopic extends FakeMqtt {
  private discoveryIsPublished: boolean = false
  private stateIsPublished: boolean = false
  public override publish(topic: string, message: Buffer): void {
    if (topic.startsWith('homeassistant')) {
      expect(message.length).not.toBe(0)
      this.discoveryIsPublished = true
    }
    if (topic.endsWith('/state/')) {
      expect(message.length).not.toBe(0)
      this.stateIsPublished = true
      if (this.stateIsPublished && this.discoveryIsPublished) this.isAsExpected = true
    }
    debug('publish: ' + topic + '\n' + message)
  }
}

class FakeMqttDeleteSlaveTopic extends FakeMqtt {
  private discoveryIsUnPublished: boolean = false
  private unsubscribed: boolean = false

  public override publish(topic: string, message: Buffer): void {
    if (topic.startsWith('homeassistant')) {
      expect(message.length).toBe(0)
      this.discoveryIsUnPublished = true
    }
    if (this.unsubscribed && this.discoveryIsUnPublished) this.isAsExpected = true
  }
  public override unsubscribe(topic: string | string[]): void {
    if ((topic as string).startsWith('wl2')) {
      this.unsubscribed = true
      if (this.unsubscribed && this.discoveryIsUnPublished) this.isAsExpected = true
    }
  }
}
class FakeMqttDeleteEntitySlave extends FakeMqtt {
  private discoveryIsUnPublished: boolean = false
  //  private unsubscribed: boolean = false

  public override publish(topic: string, message: Buffer): void {
    if (topic.startsWith('homeassistant')) {
      if (message.length == 0) this.discoveryIsUnPublished = true
    }
    this.isAsExpected = this.discoveryIsUnPublished
  }
}
class FakeMqttAddEntitySlave extends FakeMqtt {
  private discoveryIsPublished: number = 0
  private unsubscribed: boolean = false

  public override publish(topic: string, message: Buffer): void {
    if (topic.startsWith('homeassistant')) {
      expect(message.length).not.toBe(0)
      this.discoveryIsPublished++
    }
    this.isAsExpected = !this.unsubscribed && this.discoveryIsPublished == 2
  }
  public override unsubscribe(topic: string | string[]): void {
    this.unsubscribed = true
    this.isAsExpected = !this.unsubscribed && this.discoveryIsPublished == 2
  }
}

test('onAddSlave/onUpdateSlave/onDeleteSlave', (done) => {
  expect(md['subscribedSlaves'].length).toBeGreaterThan(3)
  let mdl = new MqttDiscover()
  copySubscribedSlaves(mdl['subscribedSlaves'], md['subscribedSlaves'])
  let slaveCount = mdl['subscribedSlaves'].length
  let fake: FakeMqtt = new FakeMqttAddSlaveTopic(mdl, FakeModes.Poll)
  mdl['client'] = fake as any as MqttClient
  mdl['connectMqtt'] = function (undefined) {
    mdl['onConnect'](mdl['client']!)
  }
  let spec = ConfigSpecification['specifications'].find((s: Ispecification) => s.filename == 'deyeinverterl') as Ispecification
  let slave: Islave = { slaveid: 7, specificationid: 'deyeinverterl', specification: spec as any, name: 'wl2', rootTopic: 'wl2' }
  mdl['onUpdateSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic))
    .then(() => {
      expect(mdl['subscribedSlaves'].length).toBe(slaveCount + 1)
      expect(fake.isAsExpected).toBeTruthy()
      let s1 = mdl['subscribedSlaves'].find((s) => s.getSlaveId() == 7)!.clone()
      spec = ConfigSpecification['specifications'].find((s: Ispecification) => s.filename == s1.getSpecificationId()!) as any
      let oldSpec = structuredClone(spec)
      // delete an entity

      let s3 = s1.clone()
      ConfigBus.addSpecification(s3['slave'])
      s3['slave'].specification.entities.splice(0, 1)
      fake = new FakeMqttDeleteEntitySlave(mdl, FakeModes.Poll)
      mdl['client'] = fake as any as MqttClient
      // onUpdateSlave with removed entity
      mdl['onUpdateSlave'](s3).then(() => {
        expect(fake.isAsExpected).toBeTruthy()
        expect(mdl['subscribedSlaves'].find((s) => s.getSlaveId() == 7)!.getSpecification()!.entities.length).toBe(1)
        // onUpdateSlave with added entity
        let s2 = s3.clone()
        s2.getSpecification()!.entities.push(numberTest)
        fake = new FakeMqttAddEntitySlave(mdl, FakeModes.Poll)
        mdl['client'] = fake as any as MqttClient
        mdl['onUpdateSlave'](s2).then(() => {
          expect(fake.isAsExpected).toBeTruthy()
          expect(mdl['subscribedSlaves'].find((s) => s.getSlaveId() == 7)!.getSpecification()!.entities.length).toBe(2)
          fake = new FakeMqttDeleteSlaveTopic(mdl, FakeModes.Poll)
          mdl['client'] = fake as any as MqttClient
          mdl['onDeleteSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic))
            .then(() => {
              expect(mdl['subscribedSlaves'].length).toBe(slaveCount)
              expect(fake.isAsExpected).toBeTruthy()
              done()
            })
            .catch((e) => {
              debug(e.message)
              done()
            })
        })
      })
    })
    .catch((e) => {
      debug(e.message)
      done()
    })
})
