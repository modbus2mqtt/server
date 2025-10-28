import { expect, it, beforeAll, afterAll } from '@jest/globals'
import { HttpServer as HttpServer } from '../../src/server/httpserver'
import { Config } from '../../src/server/config'
import supertest from 'supertest'
import fs from 'fs'
import { ConfigSpecification } from '../../src/specification'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { ConfigBus } from '../../src/server/configbus'
import { setConfigsDirsForTest } from './configsbase'
setConfigsDirsForTest()
new ConfigSpecification().readYaml()


var httpServer: HttpServer

const oldAuthenticate: (req: any, res: any, next: () => void) => void = HttpServer.prototype.authenticate
beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
    let cfg = new Config()
    cfg.readYamlAsync().then(() => {
      ConfigBus.readBusses()
      HttpServer.prototype.authenticate = (req, res, next) => {
        next()
      }
      httpServer = new HttpServer(join(Config.configDir, 'angular'))

      let rc = httpServer.init()
      resolve()
    })
  })
})
afterAll(() => {
  HttpServer.prototype.authenticate = oldAuthenticate
})

let doneRead: any = undefined
function binaryParser(res: any, callback: (_error: null, data: any) => void) {
  res.setEncoding('binary')
  res.chunks = []
  res.on('data', function (chunk: Buffer) {
    res.chunks.push(chunk)
  })
  res.on('end', function () {
    fs.open('target.zip', 'w', function (error, fd) {
      var buffer = Buffer.concat(res.chunks)
      // read its contents into buffer
      fs.writeSync(fd, buffer, 0, buffer.length)
      fs.close(fd)
      let zip = new AdmZip('target.zip')
      let e = zip.getEntries()
    })
    doneRead()
    //  callback(null, Buffer.concat(res.chunks));
  })
}
it('GET download/local', (done) => {
  supertest(httpServer['app'])
    .get('/download/local')
    .responseType('blob')
    .expect(200)
    .then((response) => {
      let buffer = response.body as any as Buffer
      let zip = new AdmZip(buffer)
      zip.getEntries().forEach((e) => {
        expect(e.entryName.indexOf('secrets.yaml')).toBeLessThan(0)
      })
      done()
    })
    .catch((_e: any) => {
      expect(true).toBeFalsy()
      done()
    })
})
