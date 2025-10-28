import { parse, stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import { LogLevelEnum, Logger } from './log'
import {
  EnumNumberFormat,
  FileLocation,
  IbaseSpecification,
  IimageAndDocumentUrl,
  IimportMessages,
  ImodbusSpecification,
  Inumber,
  ModbusRegisterType,
  SPECIFICATION_VERSION,
  SPECIFICATION_FILES_VERSION,
  SpecificationFileUsage,
  SpecificationStatus,
  getSpecificationI18nName,
} from '../specification.shared'
import { getBaseFilename } from '../specification.shared'
import { IfileSpecification } from './ifilespecification'
import { ConverterMap } from './convertermap'
import { M2mSpecification } from './m2mspecification'
import { IimageAndDocumentFilesType, Migrator } from './migrator'
import stream from 'stream'
import Debug from 'debug'

import { M2mGitHub } from './m2mgithub'
import AdmZip from 'adm-zip'
import { Mutex } from 'async-mutex'

const log = new Logger('specification')
export const filesUrlPrefix = 'specifications/files'
const debug = Debug('configSpec')
//const baseTopic = 'modbus2mqtt';
//const baseTopicHomeAssistant = 'homeassistant';
export class ConfigSpecification {
  static setMqttdiscoverylanguage(lang: string, ghToken?: string) {
    ConfigSpecification.mqttdiscoverylanguage = lang
    ConfigSpecification.githubPersonalToken = ghToken
  }
  static filesMutex = new Mutex()
  static mqttdiscoverylanguage: string | undefined
  static githubPersonalToken: string | undefined
  static getPublicDir(): string {
    return join(ConfigSpecification.dataDir, 'public')
  }
  static getLocalDir(): string {
    return join(ConfigSpecification.configDir, 'modbus2mqtt')
  }
  static getContributedDir(): string {
    return join(ConfigSpecification.dataDir, 'contributed')
  }
  constructor() {}
  private static getPublicSpecificationPath(spec: IbaseSpecification): string {
    return ConfigSpecification.getPublicDir() + '/specifications/' + spec.filename + '.yaml'
  }
  private static getContributedSpecificationPath(spec: IbaseSpecification): string {
    return ConfigSpecification.getContributedDir() + '/specifications/' + spec.filename + '.yaml'
  }
  private static getSpecificationPath(spec: IbaseSpecification): string {
    return ConfigSpecification.getLocalDir() + '/specifications/' + spec.filename + '.yaml'
  }
  private static getLocalFilesPath(specfilename: string): string {
    return join(ConfigSpecification.getLocalDir(), getSpecificationImageOrDocumentUrl('', specfilename, ''))
  }
  private static getPublicFilesPath(specfilename: string): string {
    return join(ConfigSpecification.getPublicDir(), getSpecificationImageOrDocumentUrl('', specfilename, ''))
  }
  private static getContributedFilesPath(specfilename: string): string {
    return join(ConfigSpecification.getContributedDir(), getSpecificationImageOrDocumentUrl('', specfilename, ''))
  }
  appendSpecificationUrls(specfilename: string, urls: IimageAndDocumentUrl[]): Promise<IimageAndDocumentUrl[] | undefined> {
    let filesPath = ConfigSpecification.getLocalFilesPath(specfilename)
    if (filesPath && !fs.existsSync(filesPath)) fs.mkdirSync(filesPath, { recursive: true })
    let files: IimageAndDocumentFilesType = { version: SPECIFICATION_FILES_VERSION, files: [] }
    let filesName = join(filesPath, 'files.yaml')

    return ConfigSpecification.filesMutex.runExclusive(() => {
      if (fs.existsSync(filesPath)) {
        try {
          let content = fs.readFileSync(filesName, { encoding: 'utf8' })
          files = parse(content.toString())
          files = new Migrator().migrateFiles(files)
        } catch (e: any) {
          debug('Unable to read Files directory for ' + filesName + '\n' + JSON.stringify(e))
        }
      } else {
        log.log(LogLevelEnum.notice, 'files path does not exist ' + filesPath)
      }
      log.log(LogLevelEnum.notice, JSON.stringify(files.files))
      log.log(LogLevelEnum.notice, JSON.stringify(urls))
      urls.forEach((url) => {
        if (files.files.find((uf) => uf.url == url.url && uf.usage == url.usage) == null) {
          files.files.push(url)
        }
      })
      fs.writeFileSync(filesName, stringify(files), {
        encoding: 'utf8',
        flag: 'w',
      })
      let spec = ConfigSpecification.specifications.find((spec) => spec.filename == specfilename)
      if (spec) spec.files = files.files

      return files && files.files ? files.files : undefined
    })
  }
  appendSpecificationFiles(
    specfilename: string,
    filenames: string[],
    usage: SpecificationFileUsage
  ): Promise<IimageAndDocumentUrl[] | undefined> {
    let iurls: IimageAndDocumentUrl[] = []
    filenames.forEach((filename) => {
      if (!usage) usage = M2mSpecification.getFileUsage(filename)
      let url = getSpecificationImageOrDocumentUrl(undefined, specfilename, filename)
      let iurl = { url: url, fileLocation: FileLocation.Local, usage: usage }
      iurls.push(iurl)
    })

    return this.appendSpecificationUrls(specfilename, iurls)
  }

  private static specifications: IfileSpecification[] = []

  static dataDir: string = ''
  static configDir: string = ''

  private readFilesYaml(directory: string, spec: IfileSpecification) {
    let fp = join(directory, 'files', spec.filename, 'files.yaml')

    if (fs.existsSync(fp)) {
      let src = fs.readFileSync(fp, { encoding: 'utf8' })
      let f: IimageAndDocumentFilesType = parse(src)
      f = new Migrator().migrateFiles(f)

      spec.files = f.files
    } else {
      //log.log(LogLevelEnum.notice, 'File not found: ' + fp)
      spec.files = []
    }
    spec.files.forEach((file) => {
      if (file.fileLocation == FileLocation.Local) {
        let url = getSpecificationImageOrDocumentUrl(undefined, spec.filename, file.url)
        file.url = url
      }
    })
  }

  private readspecifications(directory: string): IfileSpecification[] {
    var rc: IfileSpecification[] = []
    if (!fs.existsSync(directory)) {
      //log.log(LogLevelEnum.notice, 'specifications directory not found ' + directory)
      return rc
    }
    var files: string[] = fs.readdirSync(directory)
    files.forEach((file: string) => {
      try {
        if (file.endsWith('.yaml')) {
          let newfn = file.replace('.yaml', '')
          var src: string = fs.readFileSync(directory + '/' + file, {
            encoding: 'utf8',
          })
          var o: IfileSpecification = parse(src)
          if (o.version != SPECIFICATION_VERSION) {
            o = new Migrator().migrate(o)
          }
          o.filename = newfn
          this.readFilesYaml(directory, o)
          o.entities.forEach((entity) => {
            if (entity.converter != undefined) {
              let inumber = entity.converterParameters as Inumber
              if (inumber.multiplier != undefined && inumber.numberFormat == undefined) {
                inumber.numberFormat = EnumNumberFormat.default
              }
            }
            if (!o.nextEntityId || entity.id > o.nextEntityId + 1) o.nextEntityId = entity.id + 1
          })
          if (o.pullNumber) o.pullUrl = M2mGitHub.getPullRequestUrl(o.pullNumber)
          //debug("specifications: " + getSpecificationI18nName(o, "en") + " filename:" + o.filename + " new: " + newfn);
          if (!o.files) o.files = []
          rc.push(o)
        }
      } catch (e: any) {
        log.log(LogLevelEnum.error, 'Unable to load spec ' + file + ' continuing ' + e.message)
      }
    })
    return rc
  }

  // set the base file for relative includes
  readYaml(): void {
    try {
      var publishedSpecifications: IfileSpecification[] = this.readspecifications(
        ConfigSpecification.getPublicDir() + '/specifications'
      )
      var contributedSpecifications: IfileSpecification[] = this.readspecifications(
        ConfigSpecification.getContributedDir() + '/specifications'
      )
      ConfigSpecification.specifications = this.readspecifications(ConfigSpecification.getLocalDir() + '/specifications')
      // Iterate over local files
      ConfigSpecification.specifications.forEach((specification: IfileSpecification) => {
        let published = publishedSpecifications.find((obj) => {
          return obj.filename === specification.filename
        })
        if (!published)
          specification.status = SpecificationStatus.added // local only
        else {
          specification.status = SpecificationStatus.cloned // contributed expect no local
          specification.publicSpecification = published
          // copy specification files.yaml if local list is empty
          if (specification.files.length == 0 && published.files.length > 0) specification.files = structuredClone(published.files)
        }
      })
      // Iterate over contributed files
      contributedSpecifications.forEach((specification: IfileSpecification) => {
        if (
          -1 ==
          ConfigSpecification.specifications.findIndex((obj) => {
            return (
              [SpecificationStatus.cloned, SpecificationStatus.added].includes(obj.status) &&
              obj.filename === specification.filename
            )
          })
        ) {
          let published = publishedSpecifications.find((obj) => {
            return obj.filename === specification.filename
          })
          if (published) specification.publicSpecification = published
          specification.status = SpecificationStatus.contributed
          if (specification.pullNumber == undefined)
            log.log(LogLevelEnum.error, 'Contributed Specification w/o pull request number: ' + specification.filename)
          ConfigSpecification.specifications.push(specification)
        } else {
          log.log(LogLevelEnum.error, 'Specification is local and contributed this is not supported: ' + specification.filename)
        }
      })
      publishedSpecifications.forEach((specification: IfileSpecification) => {
        if (
          -1 ==
          ConfigSpecification.specifications.findIndex((obj) => {
            return obj.filename === specification.filename
          })
        ) {
          specification.status = SpecificationStatus.published
          ConfigSpecification.specifications.push(specification)
        }
      })

      //debug("Number of specifications: " + ConfigSpecification.specifications.length);
    } catch (error: any) {
      log.log(LogLevelEnum.error, 'readyaml failed: ' + error.message)
      throw error
      // Expected output: ReferenceError: nonExistentFunction is not defined
      // (Note: the exact output may be browser-dependent)
    }
  }
  filterAllSpecifications(specFunction: (spec: IfileSpecification) => void) {
    for (let spec of ConfigSpecification.specifications) {
      specFunction(spec)
    }
  }

  static emptyTestData = { holdingRegisters: [], coils: [], analogInputs: [], discreteInputs: [] }
  // removes non configuration data
  // Adds  testData array from Modbus values. They can be used to test specification
  static toFileSpecification(modbusSpec: ImodbusSpecification): IfileSpecification {
    let fileSpec: IfileSpecification = structuredClone({
      ...modbusSpec,
      version: SPECIFICATION_VERSION,
      testdata: structuredClone(this.emptyTestData),
    })
    delete fileSpec['identification']
    // delete (fileSpec as any)['status'];

    modbusSpec.entities.forEach((entity) => {
      if (entity.modbusValue)
        for (let idx = 0; idx < entity.modbusValue.length; idx++) {
          switch (entity.registerType) {
            case ModbusRegisterType.AnalogInputs:
              fileSpec.testdata.analogInputs?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
            case ModbusRegisterType.HoldingRegister:
              fileSpec.testdata.holdingRegisters?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
            case ModbusRegisterType.Coils:
              fileSpec.testdata.coils?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
            case ModbusRegisterType.DiscreteInputs:
              fileSpec.testdata.discreteInputs?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
          }
        }
    })
    if (fileSpec.testdata.analogInputs?.length == 0) delete fileSpec.testdata.analogInputs
    if (fileSpec.testdata.holdingRegisters?.length == 0) delete fileSpec.testdata.holdingRegisters
    if (fileSpec.testdata.coils?.length == 0) delete fileSpec.testdata.coils
    if (fileSpec.testdata.discreteInputs?.length == 0) delete fileSpec.testdata.discreteInputs
    fileSpec.entities.forEach((entity) => {
      delete (entity as any)['modbusValue']
      delete (entity as any)['mqttValue']
      delete (entity as any)['identified']
    })
    return fileSpec
  }
  static deleteSpecificationFile(specfilename: string, url: string, usage: SpecificationFileUsage): IimageAndDocumentUrl[] {
    let fname = getBaseFilename(url)
    let decodedUrl = decodeURIComponent(url).replaceAll('+', ' ')
    let deleteFlag: boolean = true
    let yamlFile = getSpecificationImageOrDocumentUrl(ConfigSpecification.getLocalDir(), specfilename, 'files.yaml')
    let files: IimageAndDocumentFilesType = { version: SPECIFICATION_FILES_VERSION, files: [] }
    if (fs.existsSync(yamlFile)) {
      try {
        let content = fs.readFileSync(yamlFile, { encoding: 'utf8' })
        files = parse(content.toString())
        files = new Migrator().migrateFiles(files)
        let imgFileIdx: number = files.files.findIndex(
          (f) => decodeURIComponent(f.url).replaceAll('+', ' ') == decodedUrl && f.usage == SpecificationFileUsage.img
        )
        let docFileIdx: number = files.files.findIndex(
          (f) => decodeURIComponent(f.url).replaceAll('+', ' ') == decodedUrl && f.usage == SpecificationFileUsage.documentation
        )
        if (imgFileIdx >= 0 && docFileIdx >= 0) deleteFlag = false
        let idx = usage == SpecificationFileUsage.img ? imgFileIdx : docFileIdx
        if (idx >= 0) {
          files.files.splice(idx, 1)

          fs.writeFileSync(yamlFile, stringify(files), {
            encoding: 'utf8',
            flag: 'w',
          })
          let spec = ConfigSpecification.specifications.find((spec) => spec.filename == specfilename)
          if (spec) spec.files = files.files
        }
      } catch (e: any) {
        log.log(LogLevelEnum.error, 'Unable to read Files directory for ' + specfilename)
      }
    }
    specfilename = getSpecificationImageOrDocumentUrl(ConfigSpecification.getLocalDir(), specfilename, fname)
    if (fs.existsSync(specfilename) && deleteFlag) fs.unlinkSync(specfilename)
    return files.files
  }

  private renameFilesPath(spec: IfileSpecification, oldfilename: string, newDirectory: string) {
    let oldDirectory = ConfigSpecification.getLocalDir()
    if (spec.status == SpecificationStatus.contributed) oldDirectory = ConfigSpecification.getContributedDir()
    let specsDir = join( newDirectory, 'specifications')
    let oldPath = getSpecificationImageOrDocumentUrl( oldDirectory, oldfilename, '')
    let newPath = getSpecificationImageOrDocumentUrl(join( newDirectory), spec.filename, '')
    let newParentDir = path.dirname(newPath)
    if (!fs.existsSync(newParentDir)) fs.mkdirSync(newParentDir, { recursive: true })
    if (fs.existsSync(newPath)) fs.rmSync(newPath, { recursive: true })
    if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath)
    this.readFilesYaml(specsDir, spec)
  }

  private cleanSpecForWriting(spec: IfileSpecification): void {
    spec.entities.forEach((e) => {
      if (!e.icon || e.icon.length == 0) delete e.icon
      if ((e as any).identified != undefined) delete (e as any).identified
      if ((e as any).mqttValue != undefined) delete (e as any).mqttValue
      if ((e as any).modbusValue != undefined) delete (e as any).modbusValue
      if ((e as any).commandTopicModbus) delete (e as any).commandTopicModbus
      if ((e as any).commandTopic) delete (e as any).commandTopic
      if (e.converter && (e.converter as any).registerTypes) delete (e.converter as any).registerTypes
    })
    if (!spec.manufacturer || spec.manufacturer.length == 0) delete spec.manufacturer
    if (!spec.model || spec.model.length == 0) delete spec.model
    if (spec.status != SpecificationStatus.contributed) delete spec.pullNumber
    if ((spec as any).stateTopic) delete (spec as any).stateTopic
    if ((spec as any).statePayload) delete (spec as any).statePayload
    if ((spec as any).triggerPollTopic) delete (spec as any).triggerPollTopic
    if ((spec as any).commandTopicModbus) delete (spec as any).commandTopicModbus

    delete spec.publicSpecification
    delete (spec as any).identified
    delete (spec as any).status
  }
  changeContributionStatus(filename: string, newStatus: SpecificationStatus, pullNumber?: number) {
    // moves Specification files to contribution directory
    let spec = ConfigSpecification.specifications.find((f) => f.filename == filename)
    if (!spec) throw new Error('Specification ' + filename + ' not found')
    if (newStatus && newStatus == spec.status) return
    let newPath = ConfigSpecification.getContributedSpecificationPath(spec)
    let oldPath = ConfigSpecification.getSpecificationPath(spec)
    let newDirectory = ConfigSpecification.getContributedDir()
    switch (newStatus) {
      case SpecificationStatus.published:
        oldPath = ConfigSpecification.getContributedSpecificationPath(spec)
        newPath = ConfigSpecification.getPublicSpecificationPath(spec)
        newDirectory = ConfigSpecification.getPublicDir()
        break
      case SpecificationStatus.cloned:
      case SpecificationStatus.added:
        if (spec.status == SpecificationStatus.contributed) {
          let publicPath = ConfigSpecification.getPublicSpecificationPath(spec)
          if (fs.existsSync(publicPath)) newStatus = SpecificationStatus.cloned
          else newStatus = SpecificationStatus.added
          newPath = ConfigSpecification.getSpecificationPath(spec)
          newDirectory = ConfigSpecification.getLocalDir()
          oldPath = ConfigSpecification.getContributedSpecificationPath(spec)
        }
        break

      default: // contributed
    }
    // first move files, because spec.status must point to oldPath directory before calling it
    // move spec file from oldpath to newpath
    if (newDirectory != ConfigSpecification.getPublicDir()) {
      this.renameFilesPath(spec, spec.filename, newDirectory)
      fs.renameSync(oldPath, newPath)
    } else {
      if (fs.existsSync(oldPath)) fs.rmSync(oldPath, { recursive: true }) // public directory was already fetched
      let specDir = path.parse(oldPath).dir

      let filesDir = join(specDir, 'files', spec.filename)
      if (fs.existsSync(filesDir)) fs.rmSync(filesDir, { recursive: true }) // public directory was already fetched
    }

    // Now change the status in ConfigSpecification.specifications array
    spec = ConfigSpecification.specifications.find((f) => f.filename == filename)
    if (spec) {
      spec.status = newStatus
      if (newStatus == SpecificationStatus.contributed) {
        ;(spec as IfileSpecification).pullNumber = pullNumber
        this.writeSpecificationFromFileSpec(spec, spec.filename, pullNumber)
      }
    }
  }

  writeSpecificationFromFileSpec(spec: IfileSpecification, originalFilename: string | null, pullNumber?: number) {
    if (spec.filename == '_new') {
      throw new Error('No or invalid filename for specification')
    }
    let publicFilepath = ConfigSpecification.getPublicSpecificationPath(spec)
    let contributedFilepath = ConfigSpecification.getContributedSpecificationPath(spec)
    let filename = ConfigSpecification.getSpecificationPath(spec)
    if (spec) {
      if (spec.status == SpecificationStatus.new) {
        this.renameFilesPath(spec, '_new', ConfigSpecification.getLocalDir())
      } else if (originalFilename) {
        if (originalFilename != spec.filename) {
          if (
            spec.status == SpecificationStatus.cloned ||
            spec.status == SpecificationStatus.published ||
            spec.status == SpecificationStatus.contributed
          )
            throw new Error('Cannot rename a published file')
          // delete yaml file and rename files directory
          let s = spec.filename
          spec.filename = originalFilename
          let originalFilepath = ConfigSpecification.getSpecificationPath(spec)
          spec.filename = s
          fs.unlinkSync(originalFilepath)
          this.renameFilesPath(spec, originalFilename, ConfigSpecification.getLocalDir())
        }
      } else throw new Error(spec.status + ' !=' + SpecificationStatus.new + ' and no originalfilename')
      if (spec.files && spec.files.length && [SpecificationStatus.published].includes(spec.status)) {
        // cloning with attached files
        let filespath = ConfigSpecification.getPublicFilesPath(spec.filename)
        if (SpecificationStatus.contributed == spec.status) filespath = ConfigSpecification.getContributedFilesPath(spec.filename)
        let localFilesPath = ConfigSpecification.getLocalFilesPath(spec.filename)
        if (!fs.existsSync(localFilesPath) && fs.existsSync(filespath)) {
          fs.cpSync(filespath, localFilesPath, { recursive: true })
        }
      }
      if (pullNumber != undefined) {
        spec.status = SpecificationStatus.contributed
        filename = contributedFilepath
      } else if (!fs.existsSync(publicFilepath)) spec.status = SpecificationStatus.added
      else if (fs.existsSync(contributedFilepath)) {
        spec.status = SpecificationStatus.contributed
        filename = contributedFilepath
      } else spec.status = SpecificationStatus.cloned
    } else throw new Error('spec is undefined')

    let dir = path.dirname(filename)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // Update files list add files, which are not in list yet.
    let ns: any = structuredClone(spec)
    this.cleanSpecForWriting(ns)
    ns.version = SPECIFICATION_VERSION
    delete ns.files
    let s = stringify(ns)
    fs.writeFileSync(filename, s, { encoding: 'utf8' })

    let idx = ConfigSpecification.specifications.findIndex((cspec) => {
      return cspec.filename === spec.filename
    })
    if (idx >= 0) ConfigSpecification.specifications[idx] = spec
    else ConfigSpecification.specifications.push(spec)
    return spec
  }
  writeSpecification(
    spec: ImodbusSpecification,
    onAfterSave: (filename: string) => void | undefined,
    originalFilename: string | null
  ): IfileSpecification {
    let fileSpec: IfileSpecification = ConfigSpecification.toFileSpecification(spec)
    this.writeSpecificationFromFileSpec(fileSpec, originalFilename)
    if (onAfterSave) onAfterSave(fileSpec.filename)
    return fileSpec
  }
  deleteNewSpecificationFiles() {
    let dir = getSpecificationImageOrDocumentUrl(ConfigSpecification.getLocalDir(), '_new', '')
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
  }
  deleteSpecification(specfileName: string) {
    let found = false
    for (let idx = 0; idx < ConfigSpecification.specifications.length; idx++) {
      let sp = ConfigSpecification.specifications[idx]
      if (sp.filename === specfileName)
        if (sp.status in [SpecificationStatus.cloned, SpecificationStatus.added, SpecificationStatus.new])
          try {
            found = true
            fs.unlinkSync(ConfigSpecification.getSpecificationPath(sp))
            fs.rmSync(ConfigSpecification.getLocalFilesPath(sp.filename))
            log.log(LogLevelEnum.notice, 'Specification removed: ' + sp.filename)
            return
          } catch (e: any) {
            log.log(LogLevelEnum.error, 'Unable to remove Specification ' + sp.filename + ' ' + e.message)
          } finally {
            this.readYaml()
          }
        else {
          log.log(LogLevelEnum.error, 'Unable to remove Specification ' + sp.filename + ': invalid status')
        }
    }
    // if (!found && (!specfileName || specfileName != '_new'))
    //  log.log(LogLevelEnum.notice, 'specification not found for deletion ' + specfileName)
  }

  static getSpecificationByName(name: string): IfileSpecification | undefined {
    return structuredClone(
      ConfigSpecification.specifications.find((spec) => {
        return getSpecificationI18nName(spec, 'en') === name
      })
    )
  }
  static clearModbusData(spec: IfileSpecification) {
    spec.entities.forEach((ent) => {
      delete (ent as any).modbusError
      delete (ent as any).modbusValue
      delete (ent as any).mqttValue
      delete (ent as any).identified
    })
    delete (spec as any).identified
  }

  static getSpecificationByFilename(filename: string | undefined): IfileSpecification | undefined {
    if (filename == undefined) return undefined

    if (filename == '_new') {
      let rc: IfileSpecification = {
        version: SPECIFICATION_VERSION,
        entities: [],
        files: [],
        i18n: [],
        testdata: structuredClone(this.emptyTestData),
        filename: '_new',
        status: SpecificationStatus.new,
      }
      let dir = getSpecificationImageOrDocumentUrl(ConfigSpecification.getLocalDir(), '_new', '')
      if (fs.existsSync(dir)) {
        let files = fs.readdirSync(dir)
        files.forEach((file) => {
          let url = getSpecificationImageOrDocumentUrl(ConfigSpecification.getLocalDir(), '_new', file)
          rc.files.push({
            url: url,
            fileLocation: FileLocation.Local,
            usage: M2mSpecification.getFileUsage(file),
          })
        })
      }
      ConfigSpecification.clearModbusData(rc)
      return rc
    }

    let rc = structuredClone(
      ConfigSpecification.specifications.find((spec) => {
        return spec.filename === filename
      })
    )
    if (rc) ConfigSpecification.clearModbusData(rc)
    return rc
  }
  static getFileNameFromSlaveId(slaveid: number): string {
    return 's' + slaveid
  }

  static createZipFromSpecification(specfilename: string, r: stream.Writable): void {
    let spec = { filename: specfilename } as any as IbaseSpecification
    let specFilePath = ConfigSpecification.getSpecificationPath(spec)
    let fn = ConfigSpecification.getLocalFilesPath(specfilename)
    if (!fs.existsSync(fn)) {
      ;(fn = ConfigSpecification.getContributedFilesPath(specfilename)),
        (specFilePath = ConfigSpecification.getContributedSpecificationPath(spec))
    }
    if (!fs.existsSync(fn)) {
      fn = ConfigSpecification.getPublicFilesPath(specfilename)
      specFilePath = ConfigSpecification.getPublicSpecificationPath(spec)
    }
    if (!fs.existsSync(fn)) throw new Error('no specificationPath found at ' + fn)

    if (!fs.existsSync(specFilePath)) throw new Error('no specification found at ' + specFilePath)

    let z = new AdmZip()
    z.addLocalFile(specFilePath)
    z.addLocalFolder(fn, 'files/' + specfilename)

    r.write(z.toBuffer(), () => {
      r.end()
    })
  }

  private static validateSpecificationZip(localSpecDir: string, zip: AdmZip.IZipEntry[]): IimportMessages {
    let errors: IimportMessages = { warnings: '', errors: '' }
    let filesExists = false
    let specExists = false
    for (var entry of zip) {
      if (entry.entryName.indexOf('.yaml') > 0)
        if (entry.entryName.indexOf('/files.yaml') > 0) filesExists = true
        else specExists = true

      if (fs.existsSync(join(localSpecDir, entry.entryName)))
        errors.warnings = errors.warnings + 'File cannot be overwritten: ' + entry.entryName + '\n'
    }

    if (!filesExists) errors.errors = errors.errors + 'No files.yaml found\n'
    if (!specExists) errors.errors = errors.errors + 'No specification yaml file found\n'
    return errors
  }

  static importSpecificationZip(zipfilename: string): IimportMessages {
    let localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
    try {
      let z = new AdmZip(zipfilename)
      let errors = this.validateSpecificationZip(localSpecDir, z.getEntries())
      if (errors.errors.length == 0) {
        z.extractAllTo(localSpecDir)
        new ConfigSpecification().readYaml()
        return errors
      }
    } catch (e: any) {
      return { errors: e.message, warnings: '' }
    }
    // Just to make compiler happy
    return { errors: '', warnings: '' }
  }
}

export function getSpecificationImageOrDocumentUrl(rootUrl: string | undefined, specName: string, url: string): string {
  let fn = getBaseFilename(url)
  let rc: string = ''
  if (rootUrl && rootUrl.length > 0 ) {
    let append = '/'
    if (rootUrl.endsWith('/')) append = ''
    rc = rootUrl + append + join(filesUrlPrefix, specName, fn)
  } else rc = join(filesUrlPrefix, specName, fn)

  return rc
}
