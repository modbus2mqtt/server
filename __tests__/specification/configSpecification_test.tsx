import { it, expect, jest, xit } from '@jest/globals'
import { ConfigSpecification } from '../../src/specification'
import * as fs from 'fs'
import path, { join } from 'path'
import { configDir, singleMutex, dataDir } from './configsbase'
import {
  IbaseSpecification,
  SPECIFICATION_VERSION,
  SpecificationFileUsage,
  SpecificationStatus,
  getFileNameFromName,
  getSpecificationI18nName,
  newSpecification,
} from '../../src/specification.shared'
import { IModbusResultOrError } from '../../src/specification'
import { ImodbusValues } from '../../src/specification'
import { trace } from 'console'

ConfigSpecification['configDir'] = configDir
ConfigSpecification['dataDir'] = dataDir
ConfigSpecification.setMqttdiscoverylanguage('en')
let testdata: ImodbusValues = {
  coils: new Map<number, IModbusResultOrError>(),
  discreteInputs: new Map<number, IModbusResultOrError>(),
  holdingRegisters: new Map<number, IModbusResultOrError>(),
  analogInputs: new Map<number, IModbusResultOrError>(),
}

it('check device type status', () => {
  let localSpecdir = ConfigSpecification.getLocalDir() + '/specifications'
  let publicSpecdir = ConfigSpecification.getPublicDir() + '/specifications'
  fs.mkdirSync(publicSpecdir, { recursive: true })
  let pwtl1 = join(publicSpecdir, 'waterleveltransmitter.yaml')
  fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), pwtl1)
  let pdy = join(publicSpecdir, 'deyeinverter.yaml')
  fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), pdy)
  let filesDir = join(localSpecdir, 'files/waterleveltransmitter1')

  fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), join(localSpecdir, 'waterleveltransmitter1.yaml'))

  const configSpec = new ConfigSpecification()
  configSpec.readYaml()
  ConfigSpecification.setMqttdiscoverylanguage('en')
  expect(ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!.status).toBe(SpecificationStatus.cloned)
  expect(ConfigSpecification.getSpecificationByFilename('deyeinverter')!.status).toBe(SpecificationStatus.published)
  expect(ConfigSpecification.getSpecificationByFilename('newDevice')!.status).toBe(SpecificationStatus.added)
  fs.rmSync(pwtl1)
  fs.rmSync(pdy)
})
it('write/Migrate', () => {
  fs.copyFileSync(
    join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter.yaml'),
    join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter1.yaml')
  )

  const configSpec = new ConfigSpecification()
  configSpec.readYaml()
  let wl = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!
  configSpec.writeSpecificationFromFileSpec(wl, wl.filename)
  configSpec.readYaml()
  wl = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!
  expect(wl.version).toBe(SPECIFICATION_VERSION)
  fs.copyFileSync(
    join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter1.yaml'),
    join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter.yaml')
  )
  fs.unlinkSync(join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter1.yaml'))
})

function cleanDimplexLocal() {
  let filePath = join(ConfigSpecification.getLocalDir() + '/specifications', 'dimplexpco5.yaml')
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  fs.rmSync(join(ConfigSpecification.getLocalDir() + '/specifications/files/dimplexpco5'), { recursive: true, force: true })
}

it('write cloned file', () => {
  const configSpec = new ConfigSpecification()
  cleanDimplexLocal()
  configSpec.readYaml()
  let wl = ConfigSpecification.getSpecificationByFilename('dimplexpco5')!

  configSpec.writeSpecificationFromFileSpec(wl, wl.filename)
  let specsDir = join(ConfigSpecification.getLocalDir() + '/specifications')
  expect(fs.existsSync(join(specsDir, 'dimplexpco5.yaml'))).toBeTruthy()
  expect(fs.existsSync(join(specsDir, 'files/dimplexpco5', 'files.yaml'))).toBeTruthy()
  expect(fs.existsSync(join(specsDir, 'files/dimplexpco5', 'IMG_1552.jpg'))).toBeTruthy()
  configSpec.readYaml()
  wl = ConfigSpecification.getSpecificationByFilename('dimplexpco5')!
  expect(wl.version).toBe(SPECIFICATION_VERSION)
  cleanDimplexLocal()
})

it('getFileNameFromName remove non ascii characters', () => {
  const name = '/\\*& asdf+-_.'
  let fn = getFileNameFromName(name)
  expect(fn).toBe('asdf+-_.')
})
it('getSpecificationI18nName ', () => {
  const name = '/\\*& asdf+-_.'
  const configSpec = new ConfigSpecification()
  configSpec.readYaml()
  let fn = getFileNameFromName(name)
  let spec = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')
  expect(getSpecificationI18nName(spec!, 'fr')).toBe('Water Level Transmitter')
  expect(getSpecificationI18nName(spec!, 'en')).toBe('Water Level Transmitter')
  expect(fn).toBe('asdf+-_.')
})

it('add new specification, add files, set filename', (done) => {
  let cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  let fdir = join(ConfigSpecification.getLocalDir(), '/specifications/files')
  let fdirNew = join(fdir, '_new')
  let fdirAddSpecTest = join(fdir, 'addspectest')
  fs.rmSync(fdirNew, { recursive: true, force: true })
  fs.rmSync(fdirAddSpecTest, { recursive: true, force: true })
  fs.rmSync(join(ConfigSpecification.getLocalDir(), '/specifications/files', 'addspectest.yaml'), { recursive: true, force: true })
  fs.mkdirSync(fdirNew, { recursive: true })
  fs.writeFileSync(join(fdirNew, 'test.pdf'), 'test')
  let mspec = newSpecification
  let spec = ConfigSpecification.toFileSpecification(mspec)
  cfgSpec.appendSpecificationFiles(spec.filename, ['test.pdf'], SpecificationFileUsage.documentation)
  fs.writeFileSync(join(fdirNew, 'test.jpg'), 'test')
  cfgSpec.appendSpecificationFiles(spec.filename, ['test.jpg'], SpecificationFileUsage.img)
  let g = ConfigSpecification.getSpecificationByFilename('_new')
  expect(g).not.toBeNull()
  expect(g!.files.find((f) => f.url.endsWith('/_new/test.jpg'))).not.toBeNull()
  expect(g!.files.find((f) => f.url.endsWith('/_new/test.pdf'))).not.toBeNull()
  expect(g).not.toBeNull()
  cfgSpec.appendSpecificationFiles(spec.filename, ['test.jpg'], SpecificationFileUsage.img).then((files) => {
    mspec.filename = 'addspectest'
    let wasCalled = false

    cfgSpec.writeSpecification(
      mspec,
      (filename) => {
        expect(filename).toBe(mspec.filename)
        wasCalled = true
      },
      null
    )
    expect(wasCalled).toBeTruthy()
    expect(fs.existsSync(fdirNew)).toBeFalsy()
    g = ConfigSpecification.getSpecificationByFilename('addspectest')
    expect(g).not.toBeNull()
    expect(g!.files.length).toBe(2)
    spec.filename = 'modifiedfilename'
    wasCalled = false
    cfgSpec.writeSpecification(
      mspec,
      (filename) => {
        expect(filename).toBe(mspec.filename)
        wasCalled = true
      },
      null
    )
    cfgSpec.deleteSpecification('addspectest')
    done()
  })
})
it('contribution', () => {
  singleMutex.runExclusive(() => {
    let cfg = new ConfigSpecification()
    let localSpecdir = ConfigSpecification.getLocalDir() + '/specifications'
    let contributedSpecdir = ConfigSpecification.getContributedDir() + '/specifications'
    fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), join(localSpecdir, 'waterleveltransmitter1.yaml'))
    let filesDir = join(localSpecdir, 'files/waterleveltransmitter1')
    let publicSpecdir = ConfigSpecification.getPublicDir() + '/specifications'
    fs.mkdirSync(publicSpecdir, { recursive: true })

    cleanWaterLevelTransmitter1(publicSpecdir)
    cleanWaterLevelTransmitter1(contributedSpecdir)
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir)
    fs.copyFileSync(
      join(localSpecdir, 'files/waterleveltransmitter/files.yaml'),
      join(localSpecdir, 'files/waterleveltransmitter1/files.yaml')
    )
    cfg.readYaml()
    let g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g).toBeDefined()
    expect(g?.status).toBe(SpecificationStatus.added)

    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.contributed, 1)
    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeFalsy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeFalsy()

    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.contributed)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.added, undefined)
    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.added)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.contributed, 1)
    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.contributed)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.published, 1)
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')

    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.yaml'))).toBeFalsy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeFalsy()
    expect(g?.status).toBe(SpecificationStatus.published)
    cleanWaterLevelTransmitter1(publicSpecdir)
    cleanWaterLevelTransmitter1(contributedSpecdir)
    cleanWaterLevelTransmitter1(localSpecdir)
  })
})

function cleanWaterLevelTransmitter1(contributedSpecdir: string) {
  if (fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1')))
    fs.rmSync(join(contributedSpecdir, 'files/waterleveltransmitter1'), { recursive: true })
  if (fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.yaml')))
    fs.unlinkSync(join(contributedSpecdir, 'waterleveltransmitter1.yaml'))
}
it('contribution cloned', () => {
  singleMutex.runExclusive(() => {
    let cfg = new ConfigSpecification()
    let localSpecdir = ConfigSpecification.getLocalDir() + '/specifications'
    let publicSpecdir = ConfigSpecification.getPublicDir() + '/specifications'
    let contributedSpecdir = ConfigSpecification.getContributedDir() + '/specifications'
    fs.mkdirSync(localSpecdir,{ recursive: true})
    fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), join(localSpecdir, 'waterleveltransmitter1.yaml'))
    fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), join(publicSpecdir, 'waterleveltransmitter1.yaml'))
    cleanWaterLevelTransmitter1(contributedSpecdir)
    let filesDir = join(localSpecdir, 'files/waterleveltransmitter1')
    let publicfilesDir = join(publicSpecdir, 'files/waterleveltransmitter1')

    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true })
    if (!fs.existsSync(publicfilesDir)) fs.mkdirSync(publicfilesDir, { recursive: true })
    fs.copyFileSync(
      join(localSpecdir, 'files/waterleveltransmitter/files.yaml'),
      join(localSpecdir, 'files/waterleveltransmitter1/files.yaml')
    )
    fs.copyFileSync(
      join(localSpecdir, 'files/waterleveltransmitter/files.yaml'),
      join(publicSpecdir, 'files/waterleveltransmitter1/files.yaml')
    )
    cfg.readYaml()
    let g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g).toBeDefined()
    expect(g?.status).toBe(SpecificationStatus.cloned)

    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(publicSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(publicSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.contributed, 1)
    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeFalsy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeFalsy()

    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.contributed)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.cloned, undefined)
    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.cloned)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.contributed, 1)
    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.contributed)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.published, 1)
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')

    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.yaml'))).toBeFalsy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeFalsy()
    expect(g?.status).toBe(SpecificationStatus.published)
    cleanWaterLevelTransmitter1(publicSpecdir)
    cleanWaterLevelTransmitter1(contributedSpecdir)
    cleanWaterLevelTransmitter1(localSpecdir)
  })
})

xit('importSpecificationZip existing Specification', () => {
  return new Promise<void>((resolve, reject) => {
    let zipFile = 'spec.zip'
    let cs = new ConfigSpecification()
    let s = fs.createWriteStream(zipFile)
    ConfigSpecification.createZipFromSpecification('waterleveltransmitter', s)
    let errors = ConfigSpecification.importSpecificationZip(zipFile)
    expect(errors.errors).not.toBe('')
    resolve()
  })
})

function removeLocal(specPath: string, specFilesPath: string) {
  fs.rmSync(specFilesPath, { recursive: true, force: true })
  try {
    fs.rmSync(specPath, { recursive: true, force: true })
  } catch (e: any) {
    if (e.code != 'ENOENT') console.log('error ' + e.message)
  }
}
it('importSpecificationZip ', () => {
  return new Promise<void>((resolve, reject) => {
    let filename = 'eastronsdm720-m'
    let zipFile = join(ConfigSpecification.configDir, filename + '.zip')
    let specPath = ConfigSpecification['getSpecificationPath']({ filename: filename } as IbaseSpecification)
    let specFilesPath = ConfigSpecification['getLocalFilesPath'](filename)

    removeLocal(specPath, specFilesPath)

    let cs = new ConfigSpecification()
    // Create the specification locally to be able to create the zip file in the next step
    let errors = ConfigSpecification.importSpecificationZip(zipFile)

    let s = fs.createWriteStream(zipFile)
    s.on('end', () => {
      console.log('Write finished')
    })
    s.on('error', () => {
      console.log('Write finished')
    })
    s.on('finish', () => {
      s.end()
      // Remove specification to be able to import it w/o error
      removeLocal(specPath, specFilesPath)

      ConfigSpecification.importSpecificationZip(zipFile)
      expect(fs.existsSync(specPath)).toBeTruthy()
      expect(fs.existsSync(specFilesPath)).toBeTruthy()
      removeLocal(specPath, specFilesPath)
      resolve()
    })

    ConfigSpecification.createZipFromSpecification(filename, s)
    // s.on( finish will be called after createZipFromSpecification
  })
})
