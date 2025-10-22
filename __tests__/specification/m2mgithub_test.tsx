import Debug from 'debug'
import { M2mGitHub } from '../../src/specification'
import { yamlDir } from './configsbase'
import { join } from 'path'
import { ConfigSpecification } from '../../src/specification'
import { beforeAll, expect, it, describe, jest } from '@jest/globals'
import * as fs from 'fs'

const debug = Debug('m2mgithub')

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GITHUB_TOKEN: string
    }
  }
}

Debug.enable('m2mgithub')
ConfigSpecification['yamlDir'] = yamlDir
ConfigSpecification.setMqttdiscoverylanguage('en', process.env.GITHUB_TOKEN)
beforeAll(() => {
  ConfigSpecification['yamlDir'] = yamlDir
  new ConfigSpecification().readYaml()
  M2mGitHub.prototype['createOwnModbus2MqttRepo']
})
function testWait(github: M2mGitHub, done: any) {
  github.init().then((hasGhToken) => {
    expect(hasGhToken).toBeTruthy()
    let title = 'Test'
    let content = 'Some Text'
    github
      .deleteSpecBranch('waterleveltransmitter')
      .then(() => {
        github
          .commitFiles(
            yamlDir + '/public',
            'waterleveltransmitter',
            [
              'specifications/waterleveltransmitter.yaml',
              'specifications/files/waterleveltransmitter/files.yaml',
              'specifications/files/waterleveltransmitter/IMG_1198.jpg',
            ],
            title,
            content
          )
          .then((_sha) => {
            debug('Commit created successfully')
            github
              .createPullrequest(title, content, 'waterleveltransmitter')
              .then(() => {
                done()
              })
              .catch((e) => {
                debug(github.getInfoFromError(e))
              })
          })
          .catch((e) => {
            debug(github.getInfoFromError(e))
          })
      })
      .catch((e) => {
        debug(github.getInfoFromError(e))
      })
  })
}
it('checkFiles files.yaml exists, other file is missing=> OK', () => {
  let root = yamlDir
  let github = new M2mGitHub(null, root)
  let oldFn = M2mGitHub.prototype['uploadFileAndCreateTreeParameter']
  M2mGitHub.prototype['uploadFileAndCreateTreeParameter'] = jest
    .fn<(root: string, filemname: string) => Promise<any>>()
    .mockResolvedValue({})
  let a = github['checkFiles'](root, [
    'local/specifications/files/waterleveltransmitter/files.yaml',
    'local/specifications/files/waterleveltransmitter/test.png',
  ])
  expect(a.length).toBe(1)
  M2mGitHub.prototype['uploadFileAndCreateTreeParameter'] = oldFn
})

it('checkFiles files.yaml does not exist => Exception', () => {
  let root = './__tests__/yaml-dir'
  let github = new M2mGitHub(null, root)
  let oldFn = M2mGitHub.prototype['uploadFileAndCreateTreeParameter']
  M2mGitHub.prototype['uploadFileAndCreateTreeParameter'] = jest
    .fn<(root: string, filemname: string) => Promise<any>>()
    .mockResolvedValue({})
  let t: () => void = () => {
    github['checkFiles'](root, [
      'local/specifications/files/notexists/files.yaml',
      'local/specifications/files/waterleveltransmitter/test.png',
    ])
  }
  expect(t).toThrowError()
  M2mGitHub.prototype['uploadFileAndCreateTreeParameter'] = oldFn
})

describe.skip('skipped because github tests require NODE_AUTH_TOKEN', () => {
  it('init with no github token', (done) => {
    let publictestdir = join(yamlDir, 'publictest')
    let github = new M2mGitHub(null, publictestdir)
    github['ownOwner'] = 'modbus2mqtt'
    github
      .init()
      .then((hasGhToken) => {
        expect(hasGhToken).toBeFalsy()
        fs.rmSync(publictestdir, { recursive: true })
        done()
      })
      .catch(() => {
        expect(false).toBeTruthy()
      })
  })

  it('init', (done) => {
    let github = new M2mGitHub(process.env.GITHUB_TOKEN, join(yamlDir, 'publictest'))
    github['ownOwner'] = 'modbus2mqtt'
    testWait(github, done)
    // github.deleteRepository().then(() => {
    //     testWait(github, done)
    // }).catch(e => {
    //     testWait(github, done)
    // })
  }, 10000)
})
