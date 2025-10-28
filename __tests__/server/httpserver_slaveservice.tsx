import { expect, it, test, jest, beforeAll } from '@jest/globals'
import Debug from 'debug'
import { HttpServer as HttpServer } from '../../src/server/httpserver'
import { Config } from '../../src/server/config'
import supertest from 'supertest'
import { ImodbusSpecification } from '../../src/specification.shared'
import { Bus } from '../../src/server/bus'
import { Slave } from '../../src/server.shared'
import { LogLevelEnum, Logger } from '../../src/specification'
import { ConfigSpecification } from '../../src/specification'
import { join } from 'path'
import { ConfigBus } from '../../src/server/configbus'
import { Observable, Subject } from 'rxjs'
import { initBussesForTest } from './configsbase'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions'
import { setConfigsDirsForTest } from './configsbase'
let mockReject = false
let debug = Debug('testhttpserver')
const mqttService = {
  host: 'core-mosquitto',
  port: 1883,
  ssl: false,
  protocol: '3.1.1',
  username: 'addons',
  password: 'Euso6ahphaiWei9Aeli6Tei0si2paep5agethohboophe7vae9uc0iebeezohg8e',
  addon: 'core_mosquitto',
  ingress_entry: 'test',
}
function executeHassioGetRequest<T>(_url: string, next: (_dev: T) => void, reject: (error: any) => void): void {
  if (mockReject) reject('mockedReason')
  else next({ data: mqttService } as T)
}

let log = new Logger('httpserverTest')
setConfigsDirsForTest()
new ConfigSpecification().readYaml()
Config['executeHassioGetRequest'] = executeHassioGetRequest

var httpServer: HttpServer

function mockedAuthorization(_param: any): Promise<any> {
  return new Promise<any>((resolve) => {
    resolve({ justForTesting: true })
  })
}
function mockedHttp(_options: any, cb: (res: any) => any) {
  cb({ statusCode: 200 })
}
let oldExecuteHassioGetRequest: any
const oldAuthenticate: (req: any, res: any, next: () => void) => void = HttpServer.prototype.authenticate
beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
    setConfigsDirsForTest()
    let cfg = new Config()
    cfg.readYamlAsync().then(() => {
      ConfigBus.readBusses()
      initBussesForTest()
      ;(Config as any)['fakeModbusCache'] = true
      jest.mock('../../src/server/modbus')
      // TODO Fix test: ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
      HttpServer.prototype.authenticate = (req, res, next) => {
        next()
      }
      httpServer = new HttpServer(join(Config.configDir, 'angular'))

      httpServer.setModbusCacheAvailable()
      httpServer.init()
      oldExecuteHassioGetRequest = Config['executeHassioGetRequest']
      resolve()
    })
  })
})

class MockMqttSubsctription {
  slave: Slave = new Slave(0, Bus.getBus(0)!.getSlaveBySlaveId(1)!, Config.getConfiguration().mqttbasetopic)
  getSlave(url: string): Slave | undefined {
    return this.slave
  }
  readModbus(slave: Slave): Observable<ImodbusSpecification> | undefined {
    let bus = Bus.getBus(slave.getBusId())
    if (bus) {
      let sub = new Subject<ImodbusSpecification>()
      let f = async function (sub: Subject<ImodbusSpecification>) {
        setTimeout(() => {
          sub.next(slave.getSpecification() as ImodbusSpecification)
        }, 20)
      }
      f(sub)
      return sub
    }
    return undefined
  }
  sendEntityCommandWithPublish(_slave: Slave, topic: string, payload: string): Promise<void> {
    expect(topic.startsWith('/')).toBeFalsy()
    expect(payload).toBe('20.2')
    return new Promise<void>((resolve) => {
      resolve()
    })
  }
  sendCommand(_slave: Slave, payload: string): Promise<void> {
    expect(payload.indexOf('20.2')).not.toBe(-1)
    return new Promise<void>((resolve) => {
      resolve()
    })
  }
}
function prepareMqttDiscover(): MockMqttSubsctription {
  let mockDiscover = new MockMqttSubsctription()
  MqttSubscriptions['instance'] = mockDiscover as any as MqttSubscriptions
  return mockDiscover
}
it('GET state topic', (done) => {
  let mockDiscover = prepareMqttDiscover()

  supertest(httpServer['app'])
    .get('/' + mockDiscover.slave.getStateTopic())
    .expect(200)
    .then((response) => {
      expect(response.text.indexOf('waterleveltransmitter')).not.toBe(-1)
      done()
    })
    .catch((e) => {
      log.log(LogLevelEnum.error, 'error')
      expect(1).toBeFalsy()
    })
})

test('GET command Entity topic', (done) => {
  let mockDiscover = prepareMqttDiscover()
  ConfigBus.addSpecification(mockDiscover.slave['slave'])
  let spec = mockDiscover.slave.getSpecification()
  let url = '/' + mockDiscover.slave.getEntityCommandTopic(spec!.entities[2] as any)!.commandTopic
  url = url + '20.2'
  supertest(httpServer['app'])
    .get(url)
    //.send("{hotwatertargettemperature: 20.2}")
    // .send("20.2")
    .expect(200)
    .then(() => {
      done()
    })
})
test('POST command topic', (done) => {
  let mockDiscover = prepareMqttDiscover()
  let url = '/' + mockDiscover.slave.getCommandTopic()
  supertest(httpServer['app'])
    .post(url)
    .send({ hotwatertargettemperature: 20.2 })
    // .send("20.2")
    .expect(200)
    .then(() => {
      done()
    })
})
