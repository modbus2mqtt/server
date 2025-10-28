import { IbaseSpecification, Imessage, SPECIFICATION_VERSION } from '../specification.shared'
import { LogLevelEnum, Logger } from './log'
import { Command } from 'commander'
import { ConfigSpecification } from './configspec'
import * as fs from 'fs'
import { M2mGithubValidate } from './m2mGithubValidate'
import path from 'path'
import { M2mSpecification } from './m2mspecification'
import { Octokit } from '@octokit/rest'
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GITHUB_TOKEN: string
      PR_NUMBER: string
      GITHUB_OUTPUT: string
    }
  }
}

let cli = new Command()
cli.version(SPECIFICATION_VERSION)
cli.usage('[--yaml <yaml-dir>] [--pr_number <pull request number>')
cli.usage('--config <config-dir> --data <data-dir> [--pr_number <pull request number>]')
cli.option('-c, --config <config-dir>', 'set directory for add on configuration')
cli.option('-d, --data <data-dir>', 'set directory for persistent data (public specifications)')

cli.option('-p, --pr_number <number>', 'pr_number of commit which triggered the pull request')
cli.option('-o, --pr_owner <owner>', 'Creator of the pull request')
cli.parse(process.argv)
let pr_number: number | undefined
let pr_owner: string | undefined
let options = cli.opts()
if (options['config']) {
  
  ConfigSpecification.configDir = options['config']
} else {
  ConfigSpecification.configDir = '.'
}
if (options['data']) {
  ConfigSpecification.dataDir = options['data']
} else {
  ConfigSpecification.dataDir = '.'
}

if (options['pr_number']) {
  pr_number = Number.parseInt(options['pr_number'])
}
if (options['pr_owner']) {
  pr_owner = options['pr_owner']
}
let log = new Logger('validate')

function logAndExit(e: any) {
  let step = ''
  if (e.step) step = e.step
  log.log(LogLevelEnum.error, step + ' ' + e.message)
  process.exit(5)
}

function validate() {
  if (!fs.existsSync(ConfigSpecification.configDir)) fs.mkdirSync(ConfigSpecification.configDir, { recursive: true })
  if (!fs.existsSync(ConfigSpecification.dataDir)) fs.mkdirSync(ConfigSpecification.dataDir, { recursive: true })

  if (pr_number == undefined) {
    log.log(LogLevelEnum.error, 'No Pull Request number passed in command line')
    process.exit(2)
  }
  if (pr_owner == undefined) {
    log.log(LogLevelEnum.error, 'No Pull Creator passed in command line')
    process.exit(2)
  }
  if (!process.env.GITHUB_TOKEN) {
    log.log(LogLevelEnum.error, 'No Github Access Token passed to environment variable GITHUB_TOKEN')
    process.exit(2)
  }
  log.log(LogLevelEnum.notice, 'pull request: ' + pr_number)
  let gh = new M2mGithubValidate(process.env.GITHUB_TOKEN)
  gh.listPullRequestFiles(pr_owner, pr_number)
    .then((data) => {
      let pr_number = data.pr_number
      let s = new ConfigSpecification()
      s.readYaml()
      let messages: Imessage[] = []
      let specnames: string = ''
      let lastSpec: IbaseSpecification | undefined
      let specsOnly = true
      data.files.forEach((fname) => {
        if (!fname.startsWith('specifications/')) {
          specsOnly = false
        } else if (!fname.startsWith('specifications/files/')) {
          let specname = fname.substring('specifications/'.length)
          specnames = specnames + ', ' + specname
          let fs = ConfigSpecification.getSpecificationByFilename(specname)
          if (fs) {
            let m2mSpec = new M2mSpecification(fs)
            lastSpec = fs
            messages.concat(m2mSpec.validate('en'))
          }
        }
      })
      if (specsOnly) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'SPECS_ONLY=true\n')
      if (specsOnly && specnames.length > 0) {
        specnames = specnames.substring(2)
        if (messages.length == 0) {
          log.log(LogLevelEnum.notice, 'specifications ' + specnames + ' are valid')
          gh.addIssueComment(
            pr_number!,
            "**$${\\color{green}\\space ' + specnames + '\\space validated\\space successfully}$$**\nSpecifications '" +
              specnames +
              "' have no issues"
          )
            .then(() => {
              log.log(LogLevelEnum.notice, 'Issue Comment added')
              process.exit(0)
            })
            .catch((e) => {
              logAndExit(e)
            })
        } else if (lastSpec) {
          let m: string = ''

          let errors = M2mSpecification.messages2Text(lastSpec, messages)
          log.log(
            LogLevelEnum.error,
            'not all specifications of \\space ' + specnames + '\\space are valid\\space Proceed manually'
          )
          gh.addIssueComment(
            pr_number!,
            "**$${\\color{red}Proceed\\space manually}$$**\nSpecification '" + specnames + "'\\space are not valid.\n" + errors
          )
            .then((e) => {
              logAndExit(e)
            })
            .catch((e) => {
              logAndExit(e)
            })
        } else {
          logAndExit(new Error('No specification found'))
        }
      }
    })
    .catch((e) => {
      logAndExit(e)
    })
}
validate()
