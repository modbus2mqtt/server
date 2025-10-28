import { expect, it, xit, test, jest, describe, beforeAll, afterAll } from '@jest/globals'
import { parse } from 'yaml'
import Debug from 'debug'
import { HttpServer as HttpServer } from '../../src/server'
import {
  ImodbusEntity,
  ModbusRegisterType,
  IimageAndDocumentUrl,
  IdentifiedStates,
  HttpErrorsEnum,
  FileLocation,
  Converters,
} from '../../src/specification.shared'
import { Config } from '../../src/server/config'
import { FakeMqtt, FakeModes, initBussesForTest } from './configsbase'
import supertest from 'supertest'
import * as fs from 'fs'
import { ImodbusSpecification, SpecificationFileUsage, getSpecificationI18nName } from '../../src/specification.shared'
import { Bus } from '../../src/server/bus'
import { VERSION } from 'ts-node'
import {
  apiUri,
  IBus,
  IRTUConnection,
  IModbusConnection,
  IidentificationSpecification,
  IUserAuthenticationStatus,
} from '../../src/server.shared'
import {
  IfileSpecification,
  LogLevelEnum,
  Logger,
  M2mSpecification,
} from '../../src/specification'
import { ConfigSpecification } from '../../src/specification'
import { Mutex } from 'async-mutex'
import { join } from 'path'
import { MqttDiscover } from '../../src/server/mqttdiscover'
import { MqttClient } from 'mqtt'
import { ConfigBus } from '../../src/server/configbus'
import { MqttConnector } from '../../src/server/mqttconnector'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions'
import { ModbusAPI } from '../../src/server/modbusAPI'
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
let mWaterlevel = new Mutex()
let testdir = ConfigSpecification.getLocalDir() + '/specifications/files/waterleveltransmitter/'
let testPdf = 'test.pdf'
let test1 = 'test2.jpg'

let spec: ImodbusSpecification = {
  filename: 'waterleveltransmitter',
  status: 2,
  entities: [
    {
      id: 1,
      mqttname: 'waterleveltransmitter',
      converter: 'number',
      modbusAddress: 3,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      converterParameters: { multiplier: 0.01 },
      mqttValue: '',
      modbusValue: [],
      identified: IdentifiedStates.unknown,
    },
  ],
  i18n: [
    {
      lang: 'en',
      texts: [
        { textId: 'name', text: 'Water Level Transmitter' },
        { textId: 'e1', text: 'Water Level Transmitter' },
      ],
    },
  ],
  files: [],
  identified: IdentifiedStates.unknown,
}
var httpServer: HttpServer

let spec2: IfileSpecification = { ...spec, version: VERSION, testdata: {} }
spec2.entities.push({
  id: 2,
  mqttname: '',
  converter: 'number',
  modbusAddress: 4,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  converterParameters: { multiplier: 0.01 },
  variableConfiguration: {
    targetParameter: 2,
    entityId: 1,
  },
})
function mockedAuthorization(_param: any): Promise<any> {
  return new Promise<any>((resolve) => {
    resolve({ justForTesting: true })
  })
}
function mockedHttp(_options: any, cb: (res: any) => any) {
  cb({ statusCode: 200 })
}
let oldExecuteHassioGetRequest: any
let lspec = ConfigSpecification.getLocalDir() + '/specifications/'

const oldAuthenticate: (req: any, res: any, next: () => void) => void = HttpServer.prototype.authenticate
beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
    let cfg = new Config()
    cfg.readYamlAsync().then(() => {
      ConfigBus.readBusses()
      let conn = new MqttConnector()
      let msub = new MqttSubscriptions(conn)
      let md = new MqttDiscover(conn, msub)

      let fake = new FakeMqtt(msub, FakeModes.Poll)
      conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
        onConnectCallback(fake as any as MqttClient)
      }

      initBussesForTest()
      fs.copyFileSync(lspec + 'waterleveltransmitter.yaml', lspec + 'waterleveltransmitter.bck', undefined)
      ;(Config as any)['fakeModbusCache'] = true
      jest.mock('../../src/server/modbus')
      // FIx text ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
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

it('GET /devices', (done) => {
  supertest(httpServer['app'])
    .get(apiUri.slaves + '?busid=0')
    .expect(200)
    .then((response) => {
      expect(response.body.length).toBeGreaterThan(0)
      expect(response.body[0]).toHaveProperty('slaveid')
      done()
    })
    .catch((e) => {
      log.log(LogLevelEnum.error, 'error')
      expect(1).toBeFalsy()
    })
})

// it('GET /nextCheck', (done) => {
//   M2mSpecification['ghContributions'].set('test', {
//     nextCheck: '10 Min',
//   })
//   supertest(httpServer['app'])
//     .get(apiUri.nextCheck + '?spec=test')
//     .expect(200)
//     .then((response) => {
//       done()
//     })
//     .catch((e) => {
//       log.log(LogLevelEnum.error, 'error')
//       expect(1).toBeFalsy()
//     })
// })

it('GET /specsForSlave', (done) => {
  supertest(httpServer['app'])
    .get(apiUri.specsDetection + '?busid=0&slaveid=1&language=en')
    .expect(200)
    .then((response) => {
      expect(response.body.length).toBeGreaterThan(0)
      let spec: ImodbusSpecification = response.body.find(
        (specs: IidentificationSpecification) => specs.filename == 'waterleveltransmitter'
      )
      expect(spec).not.toBeNull()
      //  expect(spec.stateTopic).not.toBeNull()
      done()
    })
})
it('GET / (root)', (done) => {
  Config['executeHassioGetRequest'] = oldExecuteHassioGetRequest
  supertest(httpServer['app'])
    .get('/index.html')
    .expect(200)
    .then((response) => {
      expect(response.text.indexOf('href="/test/"')).toBeGreaterThanOrEqual(0)
      done()
    })
    .catch((e) => {
      expect(1).toBeFalsy()
    })
})

it('GET / (root) with Ingress header', (done) => {
  Config['executeHassioGetRequest'] = oldExecuteHassioGetRequest
  supertest(httpServer['app'])
    .get('/index.html')
    .set({ 'X-Ingress-Path': 'test' })
    .expect(200)
    .then((response) => {
      expect(response.text.indexOf('base href="/test/"')).toBeGreaterThanOrEqual(0)
      done()
    })
    .catch((e) => {
      expect(1).toBeFalsy()
    })
})

it('GET angular files', (done) => {
  supertest(httpServer['app'])
    .get('/en-US/test.css')
    .expect(200)
    .then((response) => {
      expect(response.text).toBe('.justContent {\n' + '  margin: 1pt;\n' + '}\n')
      expect(response.type).toBe('text/css')
      done()
    })
})
it('GET local files', (done) => {
  supertest(httpServer['app'])
    .get('/specifications/files/waterleveltransmitter/files.yaml')
    .expect(200)
    .then((response) => {
      let o = parse(response.text)
      expect(o.files.length).toBeGreaterThan(0)
      expect((o.files[0].url as string).startsWith('/')).toBeFalsy()
      expect(o.files.length).toBeGreaterThan(0)
      expect(response.type).toBe('text/yaml')
      done()
    })
    .catch((e) => {
      expect(1).toBeFalsy()
      done()
    })
})

xit('register,login validate fails on github', (done) => {
  var token = ''
  supertest(httpServer['app'])
    .get('/user/reqister?name=test&password=test123')
    .then((_response) => {
      supertest(httpServer['app'])
        .get('/user/login?name=test&password=test123')
        .expect(200)
        .then((response) => {
          token = response.body.token
          let hdrs: Headers = new Map<string, string>() as any
          hdrs.set('Authorization', 'Bearer ' + token)
          expect(response.body.token.length).toBeGreaterThan(0)
          let req: any = {
            url: '/noauthorization needed',
          }
          let res: any = {}
          oldAuthenticate.bind(httpServer)(req, res, () => {
            req.url = '/api/Needs authorization'
            req['header'] = (key: string): string => {
              expect(key).toBe('Authorization')
              return 'Bearer ' + token
            }
            oldAuthenticate.bind(httpServer)(req, undefined, () => {
              done()
            })
          })
        })
        .catch((_err) => {
          expect(false).toBeTruthy()
        })
    })
    .catch((_err) => {
      expect(false).toBeTruthy()
    })
})

it('supervisor login', (done) => {
  // This enables hassio validation
  let res: any = {}
  let req: any = {
    url: '/api/Needs authorization',
    header: () => {
      return undefined
    },
  }
  process.env.HASSIO_TOKEN = 'test'
  supertest(httpServer['app'])
    .get(apiUri.userAuthenticationStatus)
    .expect(200)
    .then((response) => {
      let status = response.body as any as IUserAuthenticationStatus
      expect(status.mqttConfigured).toBeTruthy()
      expect(status.hasAuthToken).toBeFalsy()
      done()
    })
    .catch((e) => {
      throw new Error('Exception caught ' + e)
    })
})

it('GET /' + apiUri.specifications, (done) => {
  supertest(httpServer['app'])
    .get(apiUri.specifications)
    .expect(200)
    .then((response) => {
      expect(response.body.length).toBeGreaterThan(0)
      expect(response.body[0]).toHaveProperty('filename')
      done()
    })
    .catch((e) => {
      throw new Error('Exception caught ' + e)
    })
})

test('GET /converters', (done) => {
  supertest(httpServer['app'])
    .get('/api/converters')
    .expect(200)
    .then((response) => {
      let sensorExist = false
      response.body.forEach((element: Converters) => {
        if (element == 'number') {
          sensorExist = true
        }
      })
      expect(sensorExist).toBeTruthy()
      done()
    })
    .catch((e) => {
      throw new Error('Exception caught ' + e)
    })
})

test('GET /modbus/specification', (done) => {
  supertest(httpServer['app'])
    .get('/api/modbus/specification?busid=0&slaveid=1&spec=waterleveltransmitter')
    .expect(HttpErrorsEnum.OK)
    .then((response) => {
      let spec: ImodbusSpecification = response.body
      expect(((spec?.entities[0] as ImodbusEntity).mqttValue as number) - 21).toBeLessThan(0.001)
      done()
    })
})

test('GET /busses', (done) => {
  supertest(httpServer['app'])
    .get('/api/busses')
    .expect(200)
    .then((response) => {
      let busses: IBus[] = response.body
      expect(busses.length).toBeGreaterThan(0)
      expect((busses[0].connectionData as IRTUConnection).serialport.length).toBeGreaterThan(0)
      done()
    })
    .catch((e) => {
      throw new Error('Exception caught ' + e)
    })
})

test('ADD/DELETE /busses', (done) => {
  let newConn: IModbusConnection = {
    baudrate: 9600,
    serialport: '/dev/ttyACM1',
    timeout: 200,
  }
  initBussesForTest()

  let oldLength = Bus.getBusses().length
  const mockStaticF = jest.fn((connection: IModbusConnection) =>
    Promise.resolve(new Bus({ busId: 7, slaves: [], connectionData: {} as any }))
  )
  let orig = Bus.addBus
  Bus.addBus = mockStaticF
  supertest(httpServer['app'])
    .post('/api/bus')
    .accept('application/json')
    .send(newConn)
    .set('Content-Type', 'application/json')
    .expect(201)
    .then((response) => {
      let newNumber = response.body
      supertest(httpServer['app'])
        .delete('/api/bus?busid=' + newNumber.busid)
        .then((_response) => {
          expect(200)
          expect(Bus.getBusses().length).toBe(oldLength)
          Bus.addBus = orig
          done()
        })
    })
})

test('post specification zip', (done) => {
  supertest(httpServer['app'])
    .post(apiUri.uploadSpec)
    .accept('application/json')
    .send('Just some text to make sure it fails')
    .set('Content-Type', 'application/zip')
    .catch((e) => {
      expect(e.statusCode).toBe(HttpErrorsEnum.ErrNotAcceptable)
      done()
    })
})
test('POST /mqtt/validate', (done) => {
  let oldConfig = Config.getConfiguration()
  let config = Config.getConfiguration()
  config.mqttconnect.mqttserverurl = 'mqtt://doesnt_exist:1007'
  new Config().writeConfiguration(config)
  supertest(httpServer['app'])
    .post('/api/validate/mqtt')
    .send(config)
    .expect(200)
    .then((response) => {
      expect(response.body.valid).toBeFalsy()
      expect(response.body.message.toString().length).toBeGreaterThan(0)
      new Config().writeConfiguration(oldConfig)
      done()
    })
    .catch((e) => {
      done()
      console.error('Exception caught ' + e.toString())
    })
})

describe('http POST', () => {
  afterAll(() => {
    // Cleanup
    if (fs.existsSync(testdir + test1)) fs.unlinkSync(testdir + test1)

    if (fs.existsSync(lspec + 'waterleveltransmitter.bck')) fs.unlinkSync(lspec + 'waterleveltransmitter.bck')
  })

  test('POST /specification: add new Specification rename device.specification', (done) => {
    let conn = new MqttConnector()
    let msub = new MqttSubscriptions(conn)
    let md = new MqttDiscover(conn, msub)

    let fake = new FakeMqtt(msub, FakeModes.Poll)
    conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
      onConnectCallback(fake as any as MqttClient)
    }
    initBussesForTest()
    ConfigBus['listeners'] = []

    let spec1: ImodbusSpecification = Object.assign(spec)

    let filename = ConfigSpecification.getLocalDir() + '/specifications/waterleveltransmitter.yaml'
    fs.unlinkSync(ConfigSpecification['getSpecificationPath'](spec1))
    let url = apiUri.specfication + '?busid=0&slaveid=2&originalFilename=waterleveltransmitter'

    //@ts-ignore
    supertest(httpServer['app'])
      .post(url)
      .accept('application/json')
      .send(spec1)
      .expect(HttpErrorsEnum.OkCreated)
      .catch((e) => {
        log.log(LogLevelEnum.error, JSON.stringify(e))
        expect(1).toBeFalsy()
      })
      .then((_response) => {
        // expect((response as any as Response).status).toBe(HttpErrorsEnum.ErrBadRequest)
        let bus = Bus.getBus(0)!
        let modbusAPI = new ModbusAPI(bus)
        bus['modbusAPI'] = modbusAPI
        let ev = modbusAPI['_modbusRTUWorker']!['createEmptyIModbusValues']()
        ev.holdingRegisters.set(100, { error: new Error('failed!!!'), date: new Date() })
        modbusAPI['_modbusRTUWorker']!['cache'].set(2, ev)
        supertest(httpServer['app'])
          .post(url)
          .accept('application/json')
          .send(spec1)
          .expect(HttpErrorsEnum.OkCreated)
          .then((response) => {
            var found = ConfigSpecification.getSpecificationByFilename(spec1.filename)! as any
            let newFilename = ConfigSpecification['getSpecificationPath'](response.body)
            expect(fs.existsSync(newFilename)).toBeTruthy()
            expect(getSpecificationI18nName(found!, 'en')).toBe('Water Level Transmitter')
            expect(response)
            done()
          })
          .catch((_e) => {
            log.log(LogLevelEnum.error, _e)
          })
      })
  })
  test('POST /modbus/entity: update ModbusCache data', (done) => {
    //@ts-ignore
    supertest(httpServer['app'])
      .post('/api/modbus/entity?busid=0&slaveid=1&entityid=1')
      .send(spec2)
      .accept('application/json')
      .expect(201)
      .then((response) => {
        let entityAndMessages = response.body as ImodbusEntity
        expect(entityAndMessages.modbusValue[0]).toBe(1)
        expect(parseFloat(entityAndMessages.mqttValue as string)).toBe(0.01)

        expect(response)
        done()
      })
      .catch((e) => {
        throw new Error('Exception caught ' + e)
      })
  })

  test('POST /modbus/bus: update bus', (done) => {
    let conn = structuredClone(Bus.getBus(0)!.properties.connectionData)
    conn.timeout = 500
    initBussesForTest()
    ConfigBus.updateBusProperties(Bus.getBus(0)!.properties!, conn)
    //@ts-ignore
    supertest(httpServer['app'])
      .post('/api/bus?busid=0')
      .send(conn)
      .expect(201)
      .then((_response) => {
        expect(Bus.getBus(0)!.properties.connectionData.timeout).toBe(500)
        conn.timeout = 100
        ConfigBus.updateBusProperties(Bus.getBus(0)!.properties!, conn)
        expect(Bus.getBus(0)!.properties.connectionData.timeout).toBe(100)
        done()
      })
      .catch((e) => {
        throw new Error('Exception caught ' + e)
      })
  })

  test('POST /upload: upload files, delete uploaded file, add url, delete url', (done) => {
    mWaterlevel.runExclusive(() => {
      if (fs.existsSync(testdir + test)) fs.unlinkSync(testdir + test)
      if (fs.existsSync(testdir + test1)) fs.unlinkSync(testdir + test1)
      let lspec = ConfigSpecification.getLocalDir() + '/specifications/'
      if (!fs.existsSync(lspec + 'waterleveltransmitter.bck'))
        fs.copyFileSync(lspec + 'waterleveltransmitter.yaml', lspec + 'waterleveltransmitter.bck', undefined)
      supertest(httpServer['app'])
        .post('/api/upload?specification=waterleveltransmitter&usage=doc')
        .attach('documents', Buffer.from('whatever'), { filename: testPdf })
        .attach('documents', Buffer.from('whatever2'), { filename: test1 })
        .then((_response) => {
          let d = _response.body as IimageAndDocumentUrl[]
          expect(
            d.find(
              (ul) => ul.url.endsWith('waterleveltransmitter' + '/' + testPdf) && ul.usage === SpecificationFileUsage.documentation
            )
          ).toBeTruthy()
          expect(
            d.find(
              (ul) => ul.url.endsWith('waterleveltransmitter' + '/' + test1) && ul.usage === SpecificationFileUsage.documentation
            )
          ).toBeTruthy()
          expect(fs.existsSync(testdir + testPdf)).toBeTruthy()
          expect(fs.existsSync(testdir + test1)).toBeTruthy()
          fs.unlinkSync(testdir + test1)
          fs.copyFileSync(lspec + 'waterleveltransmitter.bck', lspec + 'waterleveltransmitter.yaml', undefined)
          supertest(httpServer['app'])
            .delete(
              '/api/upload?specification=waterleveltransmitter&url=/files/waterleveltransmitter/' +
                testPdf +
                '&usage=' +
                SpecificationFileUsage.documentation
            )
            .then(() => {
              expect(fs.existsSync(testdir + testPdf)).toBeFalsy()
              if (fs.existsSync(testdir + test1)) fs.unlinkSync(testdir + test1)
              let i = {
                url: 'http://www.spiegel.de',
                fileLocation: FileLocation.Global,
                usage: SpecificationFileUsage.documentation,
              }
              supertest(httpServer['app'])
                .post('/api/addFilesUrl?specification=waterleveltransmitter')
                .set('Content-Type', 'application/json; charset=utf-8')
                .send(i)
                .expect(201)
                .then((_response) => {
                  expect(_response.body.length).toBe(4)
                  supertest(httpServer['app'])
                    .delete(
                      '/api/upload?specification=waterleveltransmitter&url=http://www.spiegel.de&usage=' +
                        SpecificationFileUsage.documentation
                    )
                    .expect(200)
                    .then((_response) => {
                      expect(_response.body.length).toBe(3)
                      supertest(httpServer['app'])
                        .delete(
                          '/api/upload?specification=waterleveltransmitter&url=' +
                            _response.body[1].url +
                            "&usage=' + SpecificationFileUsage.documentation)"
                        )
                        .expect(200)
                        .then((_response) => {
                          expect(_response.body.length).toBe(2)

                          done()
                        })
                    })
                })
            })
        })
        .catch((e) => {
          throw new Error('Exception caught ' + e)
        })
    })
  })
})
