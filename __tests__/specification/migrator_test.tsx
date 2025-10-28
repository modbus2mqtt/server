import { expect, it } from '@jest/globals'
import { ConfigSpecification } from '../../src/specification'
import { configDir, dataDir } from './configsbase'
import { SPECIFICATION_VERSION } from '../../src/specification.shared'

ConfigSpecification['configDir'] = configDir
ConfigSpecification['dataDir'] = dataDir

it('check device type status', () => {
  const configSpec = new ConfigSpecification()
  configSpec.readYaml()
  let spec = ConfigSpecification.getSpecificationByFilename('dimplexpco5')
  expect(spec?.testdata.holdingRegisters?.length).toBeGreaterThan(0)
  spec?.entities.forEach((e) => {
    expect(e.converter.indexOf('sensor')).toBe(-1)
    expect((e as any).functionCode).toBeUndefined()
    expect(e.readonly).toBeDefined()
    expect(e.registerType).toBeDefined()
  })
  expect(spec?.testdata.analogInputs).toBeUndefined()
  expect(spec?.testdata.coils?.length).toBeGreaterThan(0)
  expect(spec?.testdata.holdingRegisters?.length).toBeGreaterThan(0)
  expect(spec?.version).toBe(SPECIFICATION_VERSION)
})
