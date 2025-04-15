import { Config } from './config'
import { HttpServer } from './httpserver'
import { Bus } from './bus'
import { Command } from 'commander'
import { VERSION } from 'ts-node'
import { LogLevelEnum, Logger, M2mGitHub, M2mSpecification } from '@modbus2mqtt/specification'
import * as os from 'os'

import Debug from 'debug'
import { MqttDiscover } from './mqttdiscover.js'
import { ConfigSpecification } from '@modbus2mqtt/specification'
import path, { dirname, join } from 'path'
import { SpecificationStatus } from '@modbus2mqtt/specification.shared'
import * as fs from 'fs'
import { ConfigBus } from './configbus'
const { argv } = require('node:process')
let httpServer: HttpServer | undefined = undefined

process.on('unhandledRejection', (reason, p) => {
  log.log(LogLevelEnum.error, 'Unhandled Rejection at: Promise', p, 'reason:', JSON.stringify(reason))
})
process.on('SIGINT', () => {
  if (httpServer) httpServer.close()
  process.exit(1)
})

const debug = Debug('modbus2mqtt')
const debugAction = Debug('actions')
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MODBUS_NOPOLL: string | undefined
    }
  }
}
//var modbusConfiguration;
let readConfig: Config
const log = new Logger('modbus2mqtt')
export class Modbus2Mqtt {
  pollTasks() {
    debugAction('readBussesFromConfig starts')
    Bus.readBussesFromConfig().then(()=>{
      if (Config.getConfiguration().githubPersonalToken)
        new ConfigSpecification().filterAllSpecifications((spec) => {
          if (spec.status == SpecificationStatus.contributed && spec.pullNumber != undefined) {
            M2mSpecification.startPolling(spec.filename, (e) => {
              log.log(LogLevelEnum.error, 'Github:' + e.message)
            })
          }
        })  
    }).catch(e=>{ log.log(LogLevelEnum.error, 'Error initializing busses ' + e.message)})
  }
  init() {
    let cli = new Command()
    cli.version(VERSION)
    cli.usage('[--ssl <ssl-dir>][--yaml <yaml-dir>][ --port <TCP port>] --term <exit code for SIGTERM>')
    cli.option('-s, --ssl <ssl-dir>', 'set directory for certificates')
    cli.option('-y, --yaml <yaml-dir>', 'set directory for add on configuration')
    cli.option('--term <exit code for SIGTERM>', 'sets exit code in case of SIGTERM')
    cli.parse(process.argv)
    let options = cli.opts()
    if (options['yaml']) {
      Config.yamlDir = options['yaml']
      ConfigSpecification.yamlDir = options['yaml']
    } else {
      Config.yamlDir = '.'
      ConfigSpecification.yamlDir = '.'
    }
    if (options['term'])
      process.on('SIGTERM', () => {
        process.exit(options['term'])
      })
    if (options['ssl']) Config.sslDir = options['ssl']
    else Config.sslDir = '.'

    readConfig = new Config()
    readConfig.readYamlAsync
      .bind(readConfig)()
      .then(() => {
        ConfigSpecification.setMqttdiscoverylanguage(
          Config.getConfiguration().mqttdiscoverylanguage,
          Config.getConfiguration().githubPersonalToken
        )
        debug(Config.getConfiguration().mqttconnect.mqttserverurl)
        let angulardir: undefined | string = undefined

        // hard coded workaround
        // let angulardir = require.resolve('@modbus2mqtt/angular')
        // Did not work in github workflow for testing
        let dir = dirname(argv[1])
        while (dir.length > 0 && (!angulardir || !fs.existsSync(angulardir))) {
          angulardir = join(dir, 'angular/dist/browser')
          if (!fs.existsSync(angulardir)) angulardir = join(dir, 'node_modules/@modbus2mqtt/angular/dist/browser')
          dir = dirname(dir)
        }
        if (!angulardir || !fs.existsSync(angulardir)) {
          log.log(LogLevelEnum.error, 'Unable to find angular start file ' + angulardir)
          process.exit(2)
        } else log.log(LogLevelEnum.notice, 'angulardir is ' + angulardir)
        let angulardirLang = path.parse(angulardir).dir
        debug('http root : ' + angulardir)
        let gh = new M2mGitHub(
          Config.getConfiguration().githubPersonalToken ? Config.getConfiguration().githubPersonalToken! : null,
          join(ConfigSpecification.yamlDir, 'public')
        )
        let startServer = () => {
          let md = MqttDiscover.getInstance()
          ConfigBus.readBusses()
          this.pollTasks()
          debugAction('readBussesFromConfig done')
          debug('Inititialize busses done')
          //execute every 30 minutes
          setInterval(
            () => {
              this.pollTasks()
            },
            30 * 1000 * 60
          )
          if (httpServer)
            httpServer
              .init()
              .then(() => {
                httpServer!.listen(() => {
                  log.log(LogLevelEnum.notice, `modbus2mqtt listening on  ${os.hostname()}: ${Config.getConfiguration().httpport}`)
                  new ConfigSpecification().deleteNewSpecificationFiles()
                  Bus.getAllAvailableModusData()
                  if (process.env.MODBUS_NOPOLL == undefined) {
                    md.startPolling()
                  } else {
                    log.log(LogLevelEnum.notice, 'Poll disabled by environment variable MODBUS_POLL')
                  }
                })
              })
              .catch((e) => {
                log.log(LogLevelEnum.error, 'Start polling Contributions: ' + e.message)
              })
        }
        httpServer = new HttpServer(angulardir)
        debugAction('readBussesFromConfig starts')
        gh.init()
          .then(startServer)
          .catch((e) => {
            startServer()
          })
      })
  }
}
let m = new Modbus2Mqtt()
m.init()

//module.exports = {connectMqtt, init}
