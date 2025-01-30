import { expect, it, xit, xtest, test, jest, describe, beforeAll, afterAll } from '@jest/globals'
import { startModbusTCPserver, stopModbusTCPServer } from '../src/modbusTCPserver'

import { HttpErrorsEnum, ImodbusSpecification, ImodbusEntity } from '@modbus2mqtt/specification.shared'
import { FakeMqtt, FakeModes, backendTCPDir, yamlDir } from './configsbase'
import supertest from 'supertest'
import { apiUri } from '@modbus2mqtt/server.shared'
import { HttpServer } from '../src/httpserver'
import { Config } from '../src/config'
import { ConfigBus } from '../src/configbus'
import { MqttClient } from 'mqtt'
import { join } from 'path'
import { MqttDiscover } from '../src/mqttdiscover'
import { ConfigSpecification } from '@modbus2mqtt/specification/dist/configspec'
var httpServer: HttpServer

beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
    let mdl = MqttDiscover.getInstance()
    // fake MQTT: avoid reconnect
    mdl['equalConnectionData']= ()=>{return true}
    let fake = new FakeMqtt(mdl, FakeModes.Poll)
    mdl['client'] = fake as any as MqttClient
    Config['yamlDir'] = backendTCPDir
    Config['sslDir']= backendTCPDir
    ConfigSpecification.yamlDir = backendTCPDir
    new ConfigSpecification().readYaml()    
    let cfg = new Config()
    cfg.readYamlAsync().then(() => {
      ConfigBus.readBusses();
      
      HttpServer.prototype.authenticate = (req, res, next) => {
        next()
      }      
      startModbusTCPserver(ConfigSpecification.yamlDir, 0)

      httpServer = new HttpServer(join(yamlDir, 'angular'))
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
  if(httpServer)
    supertest(httpServer['app'])
      .get( apiUri.modbusSpecification +'?busid=0&slaveid=3&spec=lc-technology-relay-input')
      .expect(HttpErrorsEnum.OK)
      .then((response) => {
        let spec: ImodbusSpecification = response.body

        expect(spec.entities).toBeDefined();
        expect(spec.entities.length).toEqual(16);
        expect(spec.entities[0].registerType).toEqual(2);
        done()
      })
  })

it('Coils definition provided check', (done) => {
  if(httpServer)
    supertest(httpServer['app'])
      .get( apiUri.modbusSpecification +'?busid=0&slaveid=3&spec=lc-technology-relay-input')
      .expect(HttpErrorsEnum.OK)
      .then((response) => {
        let spec: ImodbusSpecification = response.body

        expect(spec.entities).toBeDefined();
        expect(spec.entities.length).toEqual(16);
        expect(spec.entities[8].registerType).toEqual(1);
        done()
      })
  })

