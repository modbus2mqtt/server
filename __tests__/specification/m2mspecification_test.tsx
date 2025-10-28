import {
  FileLocation,
  ImodbusEntity,
  Itext,
  MessageTypes,
  ModbusRegisterType,
  SPECIFICATION_VERSION,
  SpecificationFileUsage,
  SpecificationStatus,
} from '../../src/specification.shared'
import { ConfigSpecification } from '../../src/specification'
import { ImodbusValues, M2mSpecification, emptyModbusValues } from '../../src/specification'
import { Converters, IdentifiedStates } from '../../src/specification.shared'
import * as fs from 'fs'
import { singleMutex, configDir } from './configsbase'
import { Mutex } from 'async-mutex'
import { IfileSpecification } from '../../src/specification'
import { it, expect, beforeAll, describe, afterAll } from '@jest/globals'
import { IpullRequest } from '../../src/specification/m2mGithubValidate'
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GITHUB_TOKEN: string
    }
  }
}
ConfigSpecification.setMqttdiscoverylanguage('en', process.env.GITHUB_TOKEN)
ConfigSpecification['configDir'] = configDir

beforeAll(() => {
  new ConfigSpecification().readYaml()
})
var entText: ImodbusEntity = {
  id: 2,
  mqttname: 'mqtt',
  modbusAddress: 5,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  modbusValue: [(65 << 8) | 66, (67 << 8) | 68],
  mqttValue: '',
  identified: IdentifiedStates.unknown,
  converterParameters: { stringlength: 10 },
  converter: 'text',
}

let spec: IfileSpecification = {
  entities: [
    {
      id: 1,
      mqttname: 'mqtt',
      converter: 'number' as Converters,
      modbusAddress: 3,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { multiplier: 0.1, offset: 0, uom: 'cm', identification: { min: 0, max: 200 } },
    },
    {
      id: 2,
      mqttname: 'mqtt2',
      converter: 'select' as Converters,
      modbusAddress: 4,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { optionModbusValues: [1, 2, 3] },
    },
    {
      id: 3,
      mqttname: 'mqtt3',
      converter: 'select' as Converters,
      modbusAddress: 5,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: false,
      icon: '',
      converterParameters: { optionModbusValues: [0, 1, 2, 3] },
    },
  ],
  status: 2,
  manufacturer: 'unknown',
  model: 'QDY30A',
  filename: 'waterleveltransmitter_validate',
  i18n: [
    {
      lang: 'en',
      texts: [
        { textId: 'name', text: 'name' },
        { textId: 'e1', text: 'e1' },
        { textId: 'e2', text: 'e2' },
        { textId: 'e3', text: 'e3' },
        { textId: 'e1o.1', text: 'ON' },
        { textId: 'e1o.0', text: 'OFF' },
        { textId: 'e1o.2', text: 'test' },
      ],
    },
  ],
  files: [
    { url: 'test', usage: SpecificationFileUsage.documentation, fileLocation: FileLocation.Local },
    { url: 'test1', usage: SpecificationFileUsage.img, fileLocation: FileLocation.Local },
  ],
  version: SPECIFICATION_VERSION,
  testdata: {
    holdingRegisters: [
      { address: 3, value: 1 },
      { address: 4, value: 1 },
      { address: 5, value: 1 },
      {
        address: 100,
        error: 'No data available',
      },
    ],
  },
}
describe('simple tests', () => {
  beforeAll(() => {
    singleMutex.acquire()
    new ConfigSpecification().readYaml()
  })

  afterAll(() => {
    singleMutex.release()
  })

  it('copyModbusDataToEntity  identifiation string identified', () => {
    let tspec = structuredClone(spec)
    tspec.entities = [entText]
    let values: ImodbusValues = emptyModbusValues()
    if (entText.converterParameters) (entText.converterParameters as Itext).identification = 'ABCD'
    let v: number[] = [(65 << 8) | 66, (67 << 8) | 68]
    values.holdingRegisters.set(5, { data: [v[0]] })
    values.holdingRegisters.set(6, { data: [v[1]] })

    let e = M2mSpecification.copyModbusDataToEntity(tspec, 2, values)
    expect(e.identified).toBe(IdentifiedStates.identified)
  })
  it('validation: Find a specification for the given test data', () => {
    let tspec = structuredClone(spec)
    let mspec = new M2mSpecification(tspec)
    let msgs = mspec.validate('en')
    let count = 0
    msgs.forEach((msg) => {
      if (msg.type == MessageTypes.identifiedByOthers && msg.additionalInformation.length == 1) count++
    })
    expect(count).toBe(0)
    count = 0
  })
  it('validation: readWrite FunctionCode instead of read', () => {
    let tspec = structuredClone(spec)
    tspec.entities[0].registerType = ModbusRegisterType.HoldingRegister
    tspec.entities[0].readonly = false
    let mspec = new M2mSpecification(structuredClone(tspec))
    let msgs = mspec.validate('en')
    let count = 0
    msgs.forEach((msg) => {
      if (msg.type == MessageTypes.identifiedByOthers && msg.additionalInformation.length == 1) count++
    })
    expect(count).toBe(0)
  })
  it('validation: Find no specification for the given test data', () => {
    let tspec = structuredClone(spec)
    tspec!.entities[0].registerType = ModbusRegisterType.AnalogInputs
    tspec.testdata.holdingRegisters!.splice(0, 1)
    tspec.testdata.analogInputs = [{ address: 3, value: 1 }]
    let mspec = new M2mSpecification(tspec)
    let msgs = mspec.validate('en')
    let count = 0
    msgs.forEach((msg) => {
      if (msg.type == MessageTypes.identifiedByOthers && msg.additionalInformation.length == 1) count++
    })
    expect(count).toBe(0)
  })
})

it.skip('closeContribution need github access', (done) => {
  singleMutex.acquire()

  ConfigSpecification.setMqttdiscoverylanguage('en', process.env.GITHUB_TOKEN)
  ConfigSpecification['configDir'] = configDir
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.mkdirSync(configDir)
  let tspec = structuredClone(spec)
  ConfigSpecification['specifications'].push(tspec)

  let mspec = new M2mSpecification(tspec)
  new ConfigSpecification().writeSpecificationFromFileSpec(tspec, tspec.filename, undefined)
  tspec.pullNumber = 81
  M2mSpecification.closeContribution(tspec)
    .then(() => {
      done()
      fs.rmSync(configDir, { recursive: true, force: true })
      singleMutex.release()
    })
    .catch((e) => {
      fs.rmSync(configDir, { recursive: true, force: true })
      console.log('error' + e.message)
      expect(1).toBeFalsy()
    })
})

class TestM2mSpecification {
  static rcs: { merged: boolean; closed: boolean }[] = [
    { merged: false, closed: false }, //0
    { merged: true, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false }, //5
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: false },
    { merged: false, closed: true },
  ]
  private static idx = 0
  static closeContribution(spec: IfileSpecification): Promise<IpullRequest> {
    return new Promise<IpullRequest>((resolve, reject) => {
      if (TestM2mSpecification.idx >= TestM2mSpecification.rcs.length) reject(new Error('not enough test data provided'))
      resolve({
        pullNumber: 16,
        merged: TestM2mSpecification.rcs[TestM2mSpecification.idx].merged,
        closed: TestM2mSpecification.rcs[TestM2mSpecification.idx++].closed,
      })
    })
  }
  static pollOriginal: (specfilename: string, error: (e: any) => void) => void
  static poll(specfilename: string, error: (e: any) => void): void {
    let contribution = M2mSpecification['ghContributions'].get(specfilename)
    //Speed up test set short intervals
    contribution!.m2mSpecification['ghPollInterval'] = [1, 2, 3, 4]
    TestM2mSpecification.pollOriginal(specfilename, error)
  }
}
it('startPolling', (done) => {
  let specP = structuredClone(spec)
  specP.pullNumber = 16
  specP.status = SpecificationStatus.contributed
  ConfigSpecification['specifications'].push(specP)
  ConfigSpecification.githubPersonalToken = 'abcd'
  //Speed up test set short intervals
  //m['ghPollInterval'] = [1, 2, 3, 4]
  M2mSpecification.closeContribution = TestM2mSpecification.closeContribution
  TestM2mSpecification.pollOriginal = M2mSpecification['poll']
  M2mSpecification['pollingTimeout'] = 100
  M2mSpecification['poll'] = TestM2mSpecification.poll
  let o = M2mSpecification.startPolling(specP.filename, (e) => {
    expect(true).toBeFalsy()
  })
  let callCount = 0
  let expectedCallCount = 2
  o?.subscribe({
    next(pullRequest) {
      switch (callCount) {
        case 0:
          expect(pullRequest.merged).toBeFalsy()
          break
        case 1:
          expect(pullRequest.merged).toBeTruthy()
          break
      }
      let i = M2mSpecification['ghContributions'].get(specP.filename)
      expect(i?.nextCheck).toBe('0.0 Sec')
      callCount++
      if (callCount > expectedCallCount) expect(callCount).toBe(expectedCallCount)
    },
    complete() {
      expect(M2mSpecification['ghContributions'].has(specP.filename)).toBeFalsy()
      expect(callCount).toBe(2)
      //expect(m['ghPollIntervalIndexCount']).toBe(2)
      //expect(m['ghPollIntervalIndex']).toBe(0)
      expectedCallCount = 11
      o = M2mSpecification.startPolling(specP.filename, (e) => {
        expect(true).toBeFalsy()
      })
      o?.subscribe({
        next(pullRequest) {
          switch (callCount) {
            case 0:
              expect(pullRequest.closed).toBeFalsy()
              break
            case 1:
              expect(pullRequest.closed).toBeTruthy()
              break
          }
          callCount++
          if (callCount > expectedCallCount) expect(callCount).toBe(expectedCallCount)
        },
        complete() {
          expect(callCount).toBe(expectedCallCount)
          //          expect(m['ghPollIntervalIndexCount']).toBe(0)
          //          expect(m['ghPollIntervalIndex']).toBe(1)
          done()
        },
      })
    },
  })
})
