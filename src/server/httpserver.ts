import Debug from 'debug'
import * as http from 'http'
import os from 'os'
import { Request } from 'express'
import * as express from 'express'
import { ConverterMap, filesUrlPrefix, M2mGitHub } from '../specification'
import { Config, MqttValidationResult } from './config'
import { Modbus } from './modbus'
import {
  ImodbusSpecification,
  HttpErrorsEnum,
  IimageAndDocumentUrl,
  Ispecification,
  SpecificationStatus,
  IimportMessages,
} from '../specification.shared'
import path, { join } from 'path'
import multer from 'multer'

import { GetRequestWithUploadParameter, fileStorage, zipStorage } from './httpFileUpload'
import { Bus } from './bus'
import { Subject } from 'rxjs'
import * as fs from 'fs'
import { LogLevelEnum, Logger } from '../specification'

//import { TranslationServiceClient } from '@google-cloud/translate'
import { M2mSpecification as M2mSpecification } from '../specification'
import { IUserAuthenticationStatus, IBus, Islave, apiUri, PollModes, ModbusTasks } from '../server.shared'
import { ConfigSpecification } from '../specification'
import { HttpServerBase } from './httpServerBase'
import { MqttDiscover } from './mqttdiscover'
import { Writable } from 'stream'
import { ConfigBus } from './configbus'
import { MqttConnector } from './mqttconnector'
import { MqttSubscriptions } from './mqttsubscriptions'
const debug = Debug('httpserver')
const log = new Logger('httpserver')
// import cors from 'cors';
//import { IfileSpecification } from './ispecification';

interface GetRequestWithParameter extends Request {
  query: {
    name: string
    usecache: string
    timeout: string
    busid: string
    slaveid: string
    spec: string
    filter: string
    deviceDetection: string
    entityid: string
    language: string
    originalFilename: string
    password: string
    mqttValue: string
    forContribution: string
    showAllPublicSpecs: string
  }
}
interface RequestParams {}

interface ResponseBody {}

interface RequestBody {}

interface RequestDownloadQuery {
  what?: string
}
export class HttpServer extends HttpServerBase {
  constructor(angulardir: string = '.') {
    super(angulardir)
  }
  override returnResult(req: Request, res: http.ServerResponse, code: HttpErrorsEnum, message: string, object: any = undefined) {
    if (!res.headersSent)
      try {
        res.setHeader('Content-Type', ' application/json')
      } catch (e) {
        log.log(LogLevelEnum.error, JSON.stringify(e))
      }
    super.returnResult(req, res, code, message, object)
  }
  getLanguageFromQuery(req: GetRequestWithParameter, res: http.ServerResponse): string {
    if (req.query.language == undefined) {
      throw new Error('language was not passed')
    } else return req.query.language
  }
  handleSlaveTopics(req: Request, res: http.ServerResponse, next: any): any {
    let msub = MqttSubscriptions.getInstance()
    let url = req.url.substring(1)
    let slave = msub.getSlave(url)
    if (slave) {
      if (req.method == 'GET' && url.endsWith('/state/')) {
        let md = new Modbus()
        MqttSubscriptions.readModbus(slave)?.subscribe((spec) => {
          let payload = slave.getStatePayload(spec.entities)
          this.returnResult(req, res, HttpErrorsEnum.OK, payload)
          return
        })
      } else if (req.method == 'GET' && (url.indexOf('/set/') != -1 || url.indexOf('/set/modbus/') != -1)) {
        let idx = url.indexOf('/set/')
        let postLength = 5
        if (idx == -1) {
          idx = url.indexOf('/set/modbus/')
          postLength = 11
        }
        if (idx == -1) return next() //should not happen
        msub
          .sendEntityCommandWithPublish(slave, url, url.substring(idx + postLength))
          .then(() => {
            this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((e) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: e.message }))
          })
      } else if (req.method == 'POST' && url.indexOf('/set/') != -1) {
        msub
          .sendCommand(slave, JSON.stringify(req.body))
          .then(() => {
            this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((e) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: e.message }))
          })
      } else return next()
    } else return next()
  }

  modbusCacheAvailable: boolean = false
  setModbusCacheAvailable() {
    this.modbusCacheAvailable = true
  }
  override initApp() {
      let localdir = join(ConfigSpecification.getLocalDir(), filesUrlPrefix)
      let publicdir = join(ConfigSpecification.getPublicDir(), filesUrlPrefix)
      this.app.get(/.*/, (req: Request, res: http.ServerResponse, next) => {
        debug(req.url)
        next()
      })
      this.app.use('/' + filesUrlPrefix, express.static(localdir))
      this.app.use('/' + filesUrlPrefix, express.static(publicdir))
    this.app.use(this.handleSlaveTopics.bind(this))
    //@ts-ignore
    // app.use(function (err:any, req:any, res:any, next:any) {
    //     res.status(409).json({status: err.status, message: err.message})
    //     next();
    //   });
    this.get(apiUri.userAuthenticationStatus, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug(req.url)
      req.acceptsLanguages()
      let config = Config.getConfiguration()
      let authHeader = req.header('Authorization')
      let a: IUserAuthenticationStatus = Config.getAuthStatus()
      ;(a.hasAuthToken = authHeader ? true : false),
        (a.authTokenExpired =
          authHeader != undefined && HttpServer.validateUserToken(req, undefined) == MqttValidationResult.tokenExpired)

      if (a.registered && (a.hassiotoken || a.hasAuthToken || a.noAuthentication))
        a.mqttConfigured = Config.isMqttConfigured(config.mqttconnect)

      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
      return
    })

    this.get(apiUri.converters, (req: Request, res: http.ServerResponse) => {
      debug('(/converters')
      let a = ConverterMap.getConverters()
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
      return
    })
    this.get(apiUri.userLogin, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug('(/user/login')
      if (req.query.name && req.query.password) {
        Config.login(req.query.name, req.query.password)
          .then((result) => {
            if (result) {
              res.statusCode = 200
              let a = {
                result: 'OK',
                token: result,
              }
              this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
            } else {
              this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, '{result: "Forbidden"}')
            }
          })
          .catch((err) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, '{result: "' + err + '"}', err)
          })
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, '{result: "Invalid Parameter"}')
      }
    })

    this.post(apiUri.userRegister, (req: Request, res: http.ServerResponse) => {
      debug('(/user/register')
      res.statusCode = 200
      if ((req.body.username && req.body.password) || req.body.noAuthentication) {
        Config.register(req.body.username, req.body.password, req.body.noAuthentication)
          .then(() => {
            this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((err) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: err }))
          })
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: 'Invalid Parameter' }))
      }
    })
    this.get(apiUri.specsDetection, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug(req.url)
      let msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
      } else {
        let slaveId = Number.parseInt(req.query.slaveid)
        let busid = Number.parseInt(req.query.busid)
        try {
          let language = this.getLanguageFromQuery(req, res)
          let bus = Bus.getBus(busid)
          if (bus) {
            bus
              .getAvailableSpecs(slaveId, req.query.showAllPublicSpecs != undefined, language)
              .then((result) => {
                debug('getAvailableSpecs  succeeded ' + slaveId)
                this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
              })
              .catch((e) => {
                this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'specsDetection: ' + e.message)
              })
          }
        } catch (e: any) {
          this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'specsDetection ' + e.message)
        }
      }
    })

    this.get(apiUri.sslFiles, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      if (Config.sslDir && Config.sslDir.length) {
        let result = fs.readdirSync(Config.sslDir)
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'not found')
      }
    })

    this.get(apiUri.specfication, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      let spec = req.query.spec
      if (spec && spec.length > 0) {
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(ConfigSpecification.getSpecificationByFilename(spec)))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'not found')
      }
    })

    this.get(apiUri.nextCheck, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug(req.url)
      let nc = M2mSpecification.getNextCheck(req.query.spec)
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(nc))
    })
    this.post(apiUri.nextCheck, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug(req.url)
      let nc = M2mSpecification.triggerPoll(req.query.spec)
      this.returnResult(req, res, HttpErrorsEnum.OK, 'OK')
    })
    this.get(apiUri.specifications, (req: Request, res: http.ServerResponse) => {
      debug(req.url)
      let rc: ImodbusSpecification[] = []
      new ConfigSpecification().filterAllSpecifications((spec) => {
        rc.push(M2mSpecification.fileToModbusSpecification(spec))
      })
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
    })
    this.get(apiUri.specificationFetchPublic, (req: Request, res: http.ServerResponse) => {
      debug(req.url)
      let ghToken = Config.getConfiguration().githubPersonalToken
      ghToken = ghToken == undefined ? '' : ghToken
      new M2mGitHub(ghToken, ConfigSpecification.getPublicDir()).fetchPublicFiles()
      new ConfigSpecification().readYaml()
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
    })

    this.get(apiUri.busses, (req: Request, res: http.ServerResponse) => {
      debug(req.originalUrl)
      let busses = Bus.getBusses()
      let ibs: IBus[] = []
      busses.forEach((bus) => {
        ibs.push(bus.properties)
      })
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(ibs))
    })
    this.get(apiUri.bus, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug(req.originalUrl)
      res.statusCode = 200
      if (req.query.busid && req.query.busid.length) {
        let bus = Bus.getBus(Number.parseInt(req.query.busid))
        if (bus && bus.properties) {
          bus.properties
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(bus.properties))
          return
        }
      }
      this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'invalid Parameter')
    })

    this.get(apiUri.slaves, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      let invParam = () => {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'Invalid parameter')
        return
      }
      if (req.query.busid !== undefined) {
        let busid = Number.parseInt(req.query.busid)
        let bus = Bus.getBus(busid)
        if (bus) {
          let slaves = bus.getSlaves(req.query.language)
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(slaves))
          return
        } else invParam()
      } else invParam()
    })
    this.get(apiUri.slave, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      if (req.query.busid !== undefined && req.query.slaveid !== undefined) {
        let busid = Number.parseInt(req.query.busid)
        let slaveid = Number.parseInt(req.query.slaveid)
        let slave = Bus.getBus(busid)?.getSlaveBySlaveId(slaveid, req.query.language)
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(slave))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'Invalid parameter')
      }
    })

    this.get(apiUri.configuration, (req: Request, res: http.ServerResponse) => {
      debug('configuration')
      try {
        let config = Config.getConfiguration()
        if (Config.getAuthStatus().hassiotoken) config.rootUrl = 'http://' + os.hostname() + ':' + config.httpport + '/'
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(config))
      } catch (e) {
        log.log(LogLevelEnum.error, 'Error getConfiguration: ' + JSON.stringify(e))
        this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify(e))
      }
    })
    this.get(apiUri.modbusSpecification, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug(req.url)
      debug('get specification with modbus data for slave ' + req.query.slaveid)
      let msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
        return
      }
      let bus = Bus.getBus(Number.parseInt(req.query.busid))
      if (bus === undefined) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + req.query.busid)
        return
      }
      let modbusTask = ModbusTasks.specification
      if (req.query.deviceDetection) modbusTask = ModbusTasks.deviceDetection
      let slaveid: number | undefined = undefined
      let slave = bus.getSlaveBySlaveId(Number.parseInt(req.query.slaveid))
      if (slave == undefined) {
        this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify('invalid slaveid '))
        return
      }
      Modbus.getModbusSpecification(modbusTask, bus.getModbusAPI(), slave, req.query.spec, (e: any) => {
        log.log(LogLevelEnum.error, 'http: get /specification ' + e.message)
        this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify('read specification ' + e.message))
      }).subscribe((result) => {
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
      })
    })
    this.get(apiUri.download, (req: Request<any, any, any, RequestDownloadQuery>, res: http.ServerResponse) => {
      debug(req.url)
      var downloadMethod: (filename: string, r: Writable) => Promise<void>
      var filename = 'local.zip'
      if (req.params.what == 'local') downloadMethod = Config.createZipFromLocal
      else {
        filename = req.params.what + '.zip'
        downloadMethod = (file: string, r: Writable) => {
          return new Promise<void>((resolve, reject) => {
            try {
              ConfigSpecification.createZipFromSpecification(file, r)
              resolve()
            } catch (e: any) {
              reject(e)
            }
          })
        }
      }
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-disposition', 'attachment; filename=' + filename)
      // Tell the browser that this is a zip file.
      downloadMethod(req.params.what, res)
        .then(() => {
          super.returnResult(req as Request, res, HttpErrorsEnum.OK, undefined)
        })
        .catch((e) => {
          this.returnResult(
            req as Request,
            res,
            HttpErrorsEnum.SrvErrInternalServerError,
            JSON.stringify('download Zip ' + req.params.what + e.message)
          )
        })
    })
    this.post(apiUri.specficationContribute, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      if (!req.query.spec) {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'specification name not passed')
        return
      }
      let spec = ConfigSpecification.getSpecificationByFilename(req.query.spec)
      let client = new M2mSpecification(spec as Ispecification)
      if (spec && spec.status && ![SpecificationStatus.contributed, SpecificationStatus.published].includes(spec.status)) {
        client
          .contribute(req.body.note)
          .then((response) => {
            // poll status updates of pull request
            M2mSpecification.startPolling(spec.filename, (e) => {
              log.log(LogLevelEnum.error, e.message)
            })?.subscribe((pullRequest) => {
              if (pullRequest.merged) log.log(LogLevelEnum.notice, 'Merged ' + pullRequest.pullNumber)
              else if (pullRequest.closed) log.log(LogLevelEnum.notice, 'Closed ' + pullRequest.pullNumber)
              else debug('Polled pullrequest ' + pullRequest.pullNumber)

              if (pullRequest.merged || pullRequest.closed)
                this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(response))
            })
          })
          .catch((err) => {
            res.statusCode = HttpErrorsEnum.ErrNotAcceptable
            if (err.message) res.end(JSON.stringify(err.message))
            else res.end(JSON.stringify(err))
            log.log(LogLevelEnum.error, JSON.stringify(err))
          })
      } else if (spec && spec.status && spec.status == SpecificationStatus.contributed) {
        M2mSpecification.startPolling(spec.filename, (e) => {
          log.log(LogLevelEnum.error, e.message)
        })
        this.returnResult(req, res, HttpErrorsEnum.ErrNotAcceptable, 'Specification is already contributed')
      }
    })

    this.post(apiUri.translate, (req: Request, res: http.ServerResponse) => {
      // let client = new TranslationServiceClient()
      // client
      //   .translateText(req.body)
      //   .then((response) => {
      //     let rc: string[] = []
      //     if (response[0].translations) {
      //       response[0].translations.forEach((translation) => {
      //         if (translation.translatedText) rc.push(translation.translatedText)
      //       })
      //       this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc))
      //     }
      //   })
      //   .catch((err: any) => {
      //     res.statusCode = HttpErrorsEnum.ErrNotAcceptable
      //     res.end(JSON.stringify(err.message))
      //     log.log(LogLevelEnum.error, JSON.stringify(err.message))
      //   })
      res.statusCode = HttpErrorsEnum.ErrNotAcceptable
          res.end("Google Translate not implemented")
          log.log(LogLevelEnum.error, "Google Translate not implemented")
    })

    this.post(apiUri.validateMqtt, (req: Request, res: http.ServerResponse) => {
      debug(req.url)
      let config = req.body

      Config.updateMqttTlsConfig(config)
      try {
        if (config.mqttconnect == undefined) {
          this.validateMqttConnectionResult(req, res, false, 'No parameters configured')
          return
        }
        let mqttdiscover = MqttConnector.getInstance()
        let client = req.body.mqttconnect.mqttserverurl ? req.body.mqttconnect : undefined

        mqttdiscover.validateConnection(client, (valid, message) => {
          this.validateMqttConnectionResult(req, res, valid, message)
        })
      } catch (err) {
        log.log(LogLevelEnum.error, err)
      }
    })

    this.post(apiUri.configuration, (req: Request, res: http.ServerResponse) => {
      debug('POST: ' + req.url)
      let config = Config.getConfiguration()
      new Config().writeConfiguration(req.body)
      config = Config.getConfiguration()
      ConfigSpecification.setMqttdiscoverylanguage(config.mqttdiscoverylanguage, config.githubPersonalToken)
      this.returnResult(req, res, HttpErrorsEnum.OkNoContent, JSON.stringify(config))
    })
    this.post(apiUri.bus, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug('POST: ' + req.url)
      let busid = Number.parseInt(req.query.busid)

      if (req.query.busid != undefined) {
        let bus = Bus.getBus(busid)
        if (bus)
          bus
            .updateBus(req.body)
            .then((bus) => {
              this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify({ busid: bus.properties.busId }))
            })
            .catch((e) => {
              this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, 'Bus: ' + e.message)
            })
      } else
        Bus.addBus(req.body)
          .then((bus) => {
            this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify({ busid: bus.properties.busId }))
          })
          .catch((e) => {
            this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, e.message)
          })
    })

    this.post(apiUri.modbusEntity, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug(req.url)
      let msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
        return
      } else {
        let bus = Bus.getBus(Number.parseInt(req.query.busid))!
        let entityid = req.query.entityid ? parseInt(req.query.entityid) : undefined
        let sub = new Subject<ImodbusSpecification>()
        let subscription = sub.subscribe((result) => {
          subscription.unsubscribe()
          let ent = result.entities.find((e) => e.id == entityid)
          if (ent) {
            this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(ent))
            return
          } else {
            this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, 'No entity found in specfication')
            return
          }
        })
        Modbus.getModbusSpecificationFromData(
          ModbusTasks.entity,
          bus.getModbusAPI(),
          Number.parseInt(req.query.slaveid!),
          req.body,
          sub
        )
      }
    })
    this.post(apiUri.writeEntity, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug(req.url)
      let msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
        return
      } else {
        let bus = Bus.getBus(Number.parseInt(req.query.busid))!
        let mqttValue = req.query.mqttValue
        let entityid = req.query.entityid ? parseInt(req.query.entityid) : undefined
        if (entityid && mqttValue)
          Modbus.writeEntityMqtt(bus.getModbusAPI(), Number.parseInt(req.query.slaveid), req.body, entityid, mqttValue)
            .then(() => {
              this.returnResult(req, res, HttpErrorsEnum.OkCreated, '')
            })
            .catch((e) => {
              this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, e)
            })
        else this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, 'No entity found in specfication')
      }
    })
    this.get(apiUri.serialDevices, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug(req.url)

      ConfigBus.listDevices(
        (devices) => {
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(devices))
        },
        (error) => {
          // Log the error, but return empty array
          log.log(LogLevelEnum.notice, 'listDevices: ' + error.message)
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify([]), error)
        }
      )
    })

    this.post(apiUri.specfication, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug('POST /specification: ' + req.query.busid + '/' + req.query.slaveid)
      let rd = new ConfigSpecification()
      let msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "{message: '" + msg + "'}")
        return
      }
      let bus: Bus | undefined = Bus.getBus(Number.parseInt(req.query.busid))
      let slave: Islave | undefined = bus ? bus.getSlaveBySlaveId(Number.parseInt(req.query.slaveid)) : undefined

      let originalFilename: string | null = req.query.originalFilename ? req.query.originalFilename : null
      var rc = rd.writeSpecification(
        req.body,
        (filename: string) => {
          if (bus != undefined && slave != undefined) {
            slave.specificationid = filename
            ConfigBus.writeslave(bus.getId(), slave)
          }
        },
        originalFilename
      )

      // bus
      //   ?.getAvailableSpecs(Number.parseInt(req.query.slaveid), false)
      //   .then(() => {
      //     debug('Cache updated')
      //   })
      //   .catch((e) => {
      //     debug('getAvailableModbusData failed:' + e.message)
      //   })

      this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc))
    })
    this.post(apiUri.specificationValidate, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      if (!req.query.language || req.query.language.length == 0) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass language '))
        return
      }
      let spec = new M2mSpecification(req.body)
      let messages = spec.validate(req.query.language)
      this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(messages))
    })

    this.get(apiUri.specificationValidate, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      if (!req.query.language || req.query.language.length == 0) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass language '))
        return
      }
      if (!req.query.spec || req.query.spec.length == 0) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass specification '))
        return
      }
      let fspec = ConfigSpecification.getSpecificationByFilename(req.query.spec)
      if (!fspec) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('specification not found ' + req.query.spec))
        return
      }
      let spec = new M2mSpecification(fspec)
      let messages = spec.validate(req.query.language)
      this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(messages))
    })
    this.post(apiUri.slave, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug('POST /slave: ' + JSON.stringify(req.body))
      let bus = Bus.getBus(Number.parseInt(req.query.busid))
      if (!req.query.busid || !bus) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + req.query.busid)
        return
      }
      if (req.body.slaveid == undefined) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus Id: ' + req.query.busid + ' Slave Id is not defined')
        return
      }

      res.setHeader('charset', 'utf-8')
      res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS, DELETE, GET')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-access-token')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Content-Type', 'application/json')
      let rc: Islave = bus.writeSlave(req.body)
      this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc))
    })
    this.post(apiUri.addFilesUrl, (req: GetRequestWithUploadParameter, res: http.ServerResponse) => {
      try {
        if (req.query.specification) {
          if (req.body) {
            // req.body.documents
            let config = new ConfigSpecification()
            config.appendSpecificationUrls(req.query.specification!, [req.body]).then((files) => {
              if (files) this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(files))
              else this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, ' specification not found')
            })
          } else {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, ' specification not found')
          }
        } else {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, ' specification no passed')
        }
      } catch (e: any) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Adding URL failed: ' + e.message, e)
      }
    })

    var upload = multer({ storage: fileStorage })
    this.app.post(apiUri.upload, upload.array('documents'), (req: GetRequestWithUploadParameter, res: http.ServerResponse) => {
      try {
        if (!req.query.usage) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'No Usage passed')
          return
        }

        let msg = this.checkBusidSlaveidParameter(req as any)
        if (msg !== '') {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
          return
        } else {
          debug('Files uploaded')
          if (req.files) {
            // req.body.documents
            let config = new ConfigSpecification()
            let f: string[] = []
            ;(req.files as Express.Multer.File[])!.forEach((f0: any) => {
              f.push(f0.originalname)
            })
            config.appendSpecificationFiles(req.query.specification!, f, req.query.usage!).then((files) => {
              if (files) this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(files))
              else this.returnResult(req, res, HttpErrorsEnum.OkNoContent, ' specification not found or no files passed')
            })
          } else {
            this.returnResult(req, res, HttpErrorsEnum.OkNoContent, ' specification not found or no files passed')
          }
        }
      } catch (e: any) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Upload failed: ' + e.message, e)
      }
    })
    this.app.post(apiUri.uploadSpec, multer({ storage: zipStorage }).array('zips'), (req: Request, res: http.ServerResponse) => {
      if (req.files) {
        // req.body.documents

        ;(req.files as Express.Multer.File[])!.forEach((f) => {
          try {
            let zipfilename = join(f.destination, f.filename)
            let errors = ConfigSpecification.importSpecificationZip(zipfilename)
            fs.rmdirSync(path.dirname(zipfilename), { recursive: true })

            if (errors.errors.length > 0)
              this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Import failed: ' + errors.errors, errors)
            else this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(errors))
          } catch (e: any) {
            let errors: IimportMessages = { errors: 'Import error: ' + e.message, warnings: '' }
            this.returnResult(req, res, HttpErrorsEnum.ErrNotAcceptable, errors.errors, errors)
          }
        })
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrNotAcceptable, 'No or incorrect files passed')
      }
    })

    this.delete(apiUri.upload, (req: GetRequestWithUploadParameter, res: http.ServerResponse) => {
      if (req.query.specification && req.query.url && req.query.usage) {
        let files = ConfigSpecification.deleteSpecificationFile(req.query.specification, req.query.url, req.query.usage)
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(files))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Invalid Usage')
      }
    })
    this.delete(apiUri.newSpecificationfiles, (req: Request, res: http.ServerResponse) => {
      try {
        new ConfigSpecification().deleteNewSpecificationFiles()
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify('OK'))
      } catch (err: any) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'deletion failed: ' + err.message, err)
      }
    })
    // app.post('/specification',  ( req:express.TypedRequestBody<IfileSpecification>) =>{
    //         debug( req.body.name);
    //    });
    this.delete(apiUri.specfication, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug('DELETE /specification: ' + req.query.spec)
      let rd = new ConfigSpecification()
      var rc = rd.deleteSpecification(req.query.spec)
      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((slave) => {
          if (slave.specificationid == req.query.spec) {
            delete slave.specificationid
            if (slave.pollMode == undefined) slave.pollMode = PollModes.intervall
            bus.writeSlave(slave)
          }
        })
      })
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
    })
    this.delete(apiUri.bus, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug('DELETE /busses: ' + req.query.busid)
      Bus.deleteBus(Number.parseInt(req.query.busid))
      this.returnResult(req, res, HttpErrorsEnum.OK, '')
    })
    this.delete(apiUri.slave, (req: GetRequestWithParameter, res: http.ServerResponse) => {
      debug('Delete /slave: ' + req.query.slaveid)
      if (req.query.slaveid.length > 0 && req.query.busid.length > 0) {
        let bus = Bus.getBus(Number.parseInt(req.query.busid))
        if (bus) bus.deleteSlave(Number.parseInt(req.query.slaveid))
        this.returnResult(req, res, HttpErrorsEnum.OK, '')
      }
    })
  }

  checkBusidSlaveidParameter(req: GetRequestWithParameter): string {
    if (req.query.busid === '') return req.originalUrl + ': busid was not passed'
    if (req.query.slaveid === '') return req.originalUrl + ': slaveid was not passed'
    return ''
  }

  validateMqttConnectionResult(req: Request, res: http.ServerResponse, valid: boolean, message: string) {
    let rc = {
      valid: valid,
      message: message,
    }
    this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
  }
}
