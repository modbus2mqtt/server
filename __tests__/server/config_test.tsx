import { expect, it, test, afterAll, jest, beforeAll } from '@jest/globals'
import { Config, MqttValidationResult } from '../../src/server/config'
import { getFileNameFromName } from '../../src/specification.shared'
import * as fs from 'fs'
import { setConfigsDirsForTest } from './configsbase'
import { ImqttClient, AuthenticationErrors } from '../../src/server.shared'
import AdmZip from 'adm-zip'
import Debug from 'debug'
import exp from 'constants'
setConfigsDirsForTest()
let debug = Debug('config_test')
beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
    const config = new Config()
    fs.copyFileSync(Config.getLocalDir() + "/secrets.yaml",Config.getLocalDir() + "/secrets.yaml.bck")
    config.readYamlAsync().then(() => {
      let cfg = Config.getConfiguration()
      Config.tokenExpiryTime = 2000
      cfg.noAuthentication = false
      expect((cfg as any).noentry).toBeUndefined()
      new Config().writeConfiguration(cfg)
      Config.register('test', 'test123', false).then(() => {
        Config.login('test', 'test123')
          .then((token) => {
            resolve()
          })
          .catch(reject)
      })
    })
  })
})
afterAll(() => {
  let cfg = Config.getConfiguration()
  cfg.noAuthentication = false
  new Config().writeConfiguration(cfg)
  fs.copyFileSync(Config.getLocalDir() + "/secrets.yaml.bck",Config.getLocalDir() + "/secrets.yaml")
  fs.unlinkSync(Config.getLocalDir() + "/secrets.yaml.bck");
})
test('register/login/validate', (done) => {
  const config = new Config()
  let loginExecuted: boolean = false
  let cfg = Config.getConfiguration()
  Config.tokenExpiryTime = 2000
  expect((cfg as any).noentry).toBeUndefined()
  new Config().writeConfiguration(cfg)
  Config.register('test', 'test123', false).then(() => {
    Config.login('test', 'test123').then((token) => {
      expect(Config.validateUserToken(token)).toBe(MqttValidationResult.OK)
      setTimeout(() => {
        expect(Config.validateUserToken(token)).toBe(MqttValidationResult.tokenExpired)
        Config.login('test', 'test124').catch((reason) => {
          expect(reason).toBe(AuthenticationErrors.InvalidUserPasswordCombination)
          done()
        })
      }, Config.tokenExpiryTime)
    })
  })
})
test('register/login/validate no Authentication', (done) => {
  const config = new Config()
  let cfg = Config.getConfiguration()
  expect((cfg as any).noentry).toBeUndefined()
  new Config().writeConfiguration(cfg)
  Config.register(undefined, undefined, true).then(() => {
    expect(Config.validateUserToken(undefined)).toBe(MqttValidationResult.OK)
    done()
  })
})
it('getFileNameFromName remove non ascii characters', () => {
  const name = '/\\*& asdf+-_.'
  let fn = getFileNameFromName(name)
  debug(fn)
  expect(fn).toBe('asdf+-_.')
})

it('writeConfiguration change password ', () => {
  let cr = new Config()
  let cfg = Config.getConfiguration()
  let oldpassword = cfg.mqttconnect.password
  cfg.mqttconnect.password = 'testpassword'
  cr.writeConfiguration(cfg)
  expect(Config['config'].mqttconnect.password).toBe('testpassword')
  expect(cfg.mqttconnect.password).toBe('testpassword') // from secrets.yaml
  let cfgStr = fs.readFileSync(Config.getLocalDir() + '/modbus2mqtt.yaml').toString()
  expect(cfgStr).toContain('!secret ')
  cfg.mqttconnect.password = oldpassword
  cr.writeConfiguration(cfg)
  expect(Config['config'].mqttconnect.password).toBe(oldpassword)
  cfgStr = fs.readFileSync(Config.getLocalDir() + '/modbus2mqtt.yaml').toString()
  expect(cfgStr).toContain('!secret ')
  let secretsStr = fs.readFileSync(Config.getLocalDir() + '/secrets.yaml').toString()
  expect(secretsStr).toContain(oldpassword)
})

export const mqttService = {
  host: 'core-mosquitto',
  port: 1883,
  ssl: false,
  protocol: '3.1.1',
  username: 'addons',
  password: 'Euso6ahphaiWei9Aeli6Tei0si2paep5agethohboophe7vae9uc0iebeezohg8e',
  addon: 'core_mosquitto',
}
var mockedMqttResolve = true
var mockedReason = 'Failed to get HASSIO MQTT Data'
function mockedMqtt(_param: any): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    if (mockedMqttResolve) resolve(mqttService)
    else reject(mockedReason)
  })
}

let mockReject = false
function executeHassioGetRequest<T>(_url: string, next: (_dev: T) => void, reject: (error: any) => void): void {
  if (mockReject) reject(mockedReason)
  else next({ data: mqttService } as T)
}

it('getMqttConnectOptions: read connection from hassio', (done) => {
  let oldExecute = Config['executeHassioGetRequest']
  Config['executeHassioGetRequest'] = executeHassioGetRequest
  process.env.HASSIO_TOKEN = 'test'
  let cfg = new Config()
  Config['config'].mqttusehassio = true
  cfg.getMqttConnectOptions().then((_mqttData) => {
    expect(_mqttData.mqttserverurl).toBe('mqtt://core-mosquitto:1883')
    expect(_mqttData.username).toBe(mqttService.username)
    mockReject = true
    cfg.getMqttConnectOptions().catch((reason) => {
      expect(reason).toBe(mockedReason)
      // Restore class
      process.env.HASSIO_TOKEN = ''
      Config['executeHassioGetRequest'] = oldExecute

      done()
    })
  })
})
