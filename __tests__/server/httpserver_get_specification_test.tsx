import { expect, it, beforeAll, afterAll } from '@jest/globals'
import { startModbusTCPserver, stopModbusTCPServer } from '../../src/server/modbusTCPserver'

import { HttpErrorsEnum, ImodbusSpecification } from '../../src/specification.shared'
import { FakeMqtt, FakeModes, setConfigsDirsBackendTCPForTest, initBussesForTest } from './configsbase'
import supertest from 'supertest'
import { apiUri } from '../../src/server.shared'
import { HttpServer } from '../../src/server/httpserver'
import { Config } from '../../src/server/config'
import { ConfigBus } from '../../src/server/configbus'
import { MqttClient } from 'mqtt'
import { join } from 'path'
import { ConfigSpecification } from '../../src/specification'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions'
import { MqttConnector } from '../../src/server/mqttconnector'
var httpServer: HttpServer

beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
    // fake MQTT: avoid reconnect
    setConfigsDirsBackendTCPForTest()
    
    let conn = new MqttConnector()
    let msub = new MqttSubscriptions(conn)

    let fake = new FakeMqtt(msub, FakeModes.Poll)
    conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
      onConnectCallback(fake as any as MqttClient)
    }
    new ConfigSpecification().readYaml()
    let cfg = new Config()
    cfg.readYamlAsync().then(() => {
      ConfigBus.readBusses()
      initBussesForTest()
      HttpServer.prototype.authenticate = (req, res, next) => {
        next()
      }
      startModbusTCPserver(ConfigSpecification.configDir, ConfigSpecification.dataDir, 0)

      httpServer = new HttpServer(join(ConfigSpecification.configDir, 'angular'))
      httpServer.setModbusCacheAvailable()
      httpServer.init()
      resolve()
    })
  })
})
afterAll(() => {
  stopModbusTCPServer()
})

it('Discrete Inputs definition provided check', (done) => {
  if (httpServer)
    supertest(httpServer['app'])
      .get(apiUri.modbusSpecification + '?busid=0&slaveid=3&spec=lc-technology-relay-input')
      .expect(HttpErrorsEnum.OK)
      .then((response) => {
        let spec: ImodbusSpecification = response.body

        expect(spec.entities).toBeDefined()
        expect(spec.entities.length).toEqual(16)
        expect(spec.entities[0].registerType).toEqual(2)
        done()
      })
})

it('Coils definition provided check', (done) => {
  if (httpServer)
    supertest(httpServer['app'])
      .get(apiUri.modbusSpecification + '?busid=0&slaveid=3&spec=lc-technology-relay-input')
      .expect(HttpErrorsEnum.OK)
      .then((response) => {
        let spec: ImodbusSpecification = response.body

        expect(spec.entities).toBeDefined()
        expect(spec.entities.length).toEqual(16)
        expect(spec.entities[8].registerType).toEqual(1)
        done()
      })
})
