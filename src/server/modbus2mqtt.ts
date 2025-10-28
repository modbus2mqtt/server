import { Config } from './config'
import { HttpServer } from './httpserver'
import { Bus } from './bus'
import { Command } from 'commander'
import { VERSION } from 'ts-node'
import { LogLevelEnum, Logger, M2mGitHub, M2mSpecification } from '../specification'
import * as os from 'os'

import Debug from 'debug'
import { MqttDiscover } from './mqttdiscover.js'
import { ConfigSpecification } from '../specification'
import path, { dirname, join } from 'path'
import { SpecificationStatus } from '../specification.shared'
import * as fs from 'fs'
import { ConfigBus } from './configbus'
const { argv } = require('node:process')
let httpServer: HttpServer | undefined = undefined

process.on('unhandledRejection', (reason, p) => {
  log.log(LogLevelEnum.error, 'Unhandled Rejection at: Promise', p, 'reason:', JSON.stringify(reason))
})
process.on('SIGINT', () => {
  if (httpServer) httpServer.close()
  Bus.stopBridgeServers()
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
    if (Config.getConfiguration().githubPersonalToken)
      new ConfigSpecification().filterAllSpecifications((spec) => {
        if (spec.status == SpecificationStatus.contributed && spec.pullNumber != undefined) {
          M2mSpecification.startPolling(spec.filename, (e) => {
            log.log(LogLevelEnum.error, 'Github:' + e.message)
          })
        }
      })
  }
  init() {
    let cli = new Command()
    cli.version(VERSION)
    cli.usage('[--ssl <ssl-dir>][--yaml <yaml-dir>][ --port <TCP port>] --term <exit code for SIGTERM>')
    cli.option('-s, --ssl <ssl-dir>', 'set directory for certificates')
    cli.option('-c, --config <config-dir>', 'set directory for add on configuration')
    cli.option('-d, --data <data-dir>', 'set directory for persistent data (public specifications)')
    cli.option('--term <exit code for SIGTERM>', 'sets exit code in case of SIGTERM')
    cli.parse(process.argv)
    let options = cli.opts()
    if (options['data']) {
      Config.dataDir = options['data']
      ConfigSpecification.dataDir = options['data']
    } else {
      Config.dataDir = '.'
      ConfigSpecification.dataDir = '.'
    }
    if (options['config']) {
      Config.configDir = options['config']
      ConfigSpecification.configDir = options['config']
    } else {
      Config.configDir = '.'
      ConfigSpecification.configDir = '.'
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
        // let angulardir = require.resolve('../angular')
        // Did not work in github workflow for testing
        var dir= dirname(argv[1]).replace(/\/server$/g, "" );
        angulardir = join(dir , 'angular/browser')
        
        if (!angulardir || !fs.existsSync(angulardir)) {
          log.log(LogLevelEnum.error, 'Unable to find angular start file ' + angulardir)
          process.exit(2)
        } else log.log(LogLevelEnum.notice, 'angulardir is ' + angulardir)
        let angulardirLang = path.parse(angulardir).dir
        debug('http root : ' + angulardir)
        let gh = new M2mGitHub(
          Config.getConfiguration().githubPersonalToken ? Config.getConfiguration().githubPersonalToken! : null,
          ConfigSpecification.getPublicDir()
        )
        let startServer = () => {
          MqttDiscover.getInstance()
          ConfigBus.readBusses()
          Bus.readBussesFromConfig().then(() => {
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
                    log.log(
                      LogLevelEnum.notice,
                      `modbus2mqtt listening on  ${os.hostname()}: ${Config.getConfiguration().httpport}`
                    )
                    new ConfigSpecification().deleteNewSpecificationFiles()
                    // clean cache once per hour
                    setInterval(
                      () => {
                        Bus.cleanupCaches()
                      },
                      1000 * 60 // 1 minute
                    )
                    if (process.env.MODBUS_NOPOLL == undefined) {
                      Bus.getBusses().forEach((bus) => {
                        bus.startPolling()
                      })
                    } else {
                      log.log(LogLevelEnum.notice, 'Poll disabled by environment variable MODBUS_POLL')
                    }
                  })
                })
                .catch((e) => {
                  log.log(LogLevelEnum.error, 'Start polling Contributions: ' + e.message)
                })
          })
        }
        httpServer = new HttpServer(angulardir)
        debugAction('readBussesFromConfig starts')
        gh.init().finally(startServer)
      })
  }
}
let m = new Modbus2Mqtt()
m.init()

//module.exports = {connectMqtt, init}
