import { Command } from 'commander'
import { VERSION } from 'ts-node'
import { ConfigSpecification, Logger, LogLevelEnum } from '../specification'
import Debug from 'debug'
import { Config } from './config'
import process from 'process'
import { startModbusTCPserver } from './modbusTCPserver'
const debug = Debug('modbusTCPserver')
const log = new Logger('modbusTCPserver')

let cli = new Command()
cli.version(VERSION)
cli.usage('--config <config-dir> --data <data-dir> --busid <buis id number>')
cli.option('-c, --config <config-dir>', 'set directory for add on configuration')
cli.option('-d, --data <data-dir>', 'set directory for persistent data (public specifications)')
cli.option('-b, --busid <bus id>', 'starts Modbus TCP server for the given yaml-dir and bus')
cli.parse(process.argv)
let options = cli.opts()
if (options['config']) {
  Config.configDir = options['config']
  ConfigSpecification.configDir = options['config']
} else {
  Config.configDir = '.'
  ConfigSpecification.configDir = '.'
}
if (options['data']) {
  Config.dataDir = options['data']
  ConfigSpecification.dataDir = options['data']
} else {
  Config.dataDir = '.'
  ConfigSpecification.dataDir = '.'
}
if (options['busid']) {
  startModbusTCPserver(ConfigSpecification.configDir, ConfigSpecification.dataDir, parseInt(options['busid']))
} else log.log(LogLevelEnum.error, 'Unable to start Modbus TCP server invalid argument: ' + options['busid'])
