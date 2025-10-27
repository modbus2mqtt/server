const { defineConfig } = require('cypress')
const EventEmitter = require('node:events')

const MqttHelper = require('./cypress/functions/mqtt')
const waitOn = require('wait-on')
const net = require('net')
const spawn = require('child_process').spawn
const execFileSync = require('child_process').execFileSync
const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')
const { clearTimeout } = require('node:timers')
const { execSync } = require('node:child_process')
const localhost='127.0.0.1'
const stopServiceTimeout = 20000
var initControllers = []
var resetControllers = []
var logStartupFlag = false
var logServersFlag = false
function pidIsRunning(pid) {
  try {
    process.kill(pid, 'SIGINT')
    return true
  } catch (e) {
    let rc = e.code != 'ESRCH'
    return rc
  }
}
function logStartup(msg) {
  if (logStartupFlag) console.log(msg)
}
function logServer(msg) {
  if (logStartupFlag) console.log(msg)
}
function stopChildProcess(c) {
  logStartup('stopChildProcess ' + c.command + ' ' + c.child_process.pid + ' ' + (c.killpid ? c.killpid : 'no killpid'))
  console.log('stopChildProcess ' + c.command + ' ' + c.child_process.pid + ' ' + (c.killpid ? c.killpid : 'no killpid'))
  c.child_process.on('SIGINT', (err) => {
    logStartup('Aborted: ' + JSON.stringify(err))
  })
  if (c.killpid > 0 && c.child_process.pid != c.killpid) {
    logStartup('Killing ' + c.killpid)
    console.log('killing ' + c.command + ' ' + c.child_process.pid + ' ' + (c.killpid ? c.killpid : 'no killpid'))
    process.kill(c.killpid, 'SIGINT')
  }
  c.child_process.kill('SIGINT')
}
let stoppedTimer = {}
let tmpdirs = []
let onAllProcessesStopped = new EventEmitter()

function startProcesses(args, ports) {
  return new Promise((resolve, reject) => {
    args.forEach((arg) => {
      logStartup('starting ' + arg)
      let child_process = spawn('/bin/sh', arg.split(' '), { detached: true, encoding: 'utf-8' })
      child_process.unref()
      child_process.stdout.on('data', function (data) {
        data
          .toString()
          .split('\n')
          .forEach((line) => {
            if (line.startsWith('TMPDIR=')) {
              let t = tmpdirs.find((tc) => tc.args == this.args)
              let tmp = line.substring('TMPDIR='.length).trim()

              if (t) t.tmpdir = tmp
              else tmpdirs.push({ args: arg, tmpdir: tmp })
            }
          })

        logStartup(data.toString())
      })
      child_process.stderr.on('data', function (data) {
        logStartup(data.toString())
      })
    })
    waitForPorts(args, ports)
      .then(() => {
        logStartup('Processes started')
        resolve('OK')
      })
      .catch(reject)
  })
}

function checkListeningPort(port) {
  var server = net.createServer()

  server.once('error', function (err) {
    if (err.code === 'EADDRINUSE') {
      console.log('Port ' + port + ' is still listening')
    }
  })

  server.once('listening', function () {
    // close the server if listening doesn't fail
    server.close()
  })

  server.listen(port)
}

function waitForPorts(args, ports) {
  return new Promise((resolve, reject) => {
    let opts = {
      resources: [],
      timeout: 20000,
    }
    if (ports && ports.length) {
      ports.forEach((port) => {
        opts.resources.push('tcp:' + localhost +':' + port)
      })
    }

    waitOn(opts)
      .then(() => {
        logStartup('WaitThen')
        let rc = []
        logStartup('waitSuccess ' + ' '.concat(args))
        resolve('Process started')
      })
      .catch(reject)
  })
}
function stopServices() {
  return new Promise((resolve, reject) => {
    exec('cypress/servers/killTestServers', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`)
        reject()
        return
      }
      console.log('stopServices: success ')
      tmpdirs = []
      if (stdout.length) console.log(`stdout: ${stdout}`)

      if (stderr.length) console.error(`stderr: ${stderr}`)
      resolve('OK')
    })
  })
}

module.exports = defineConfig({
  component: {
    devServer: {
      framework: "angular",
      bundler: "webpack",
    },
    specPattern: "**/*.cy.ts",
  },
  e2e: {
    setupNodeEvents(on, config) {
      logStartupFlag = config.env.logstartup
      console.log('Startup Logging is ' + (logStartupFlag ? 'enabled' : 'disabled'))
      logServersFlag = config.env.logservers
      console.log('Server Logging is ' + (logServersFlag ? 'enabled' : 'disabled'))

      // implement node event listeners here
      on('task', {
        mqttConnect(connectionData) {
          return new Promise((resolve, reject) => {
            // mqtt connect with onConnected = resolve
            let mqttHelper = MqttHelper.getInstance()
            mqttHelper.connect(connectionData)
            resolve('connected')
          })
        },
        mqttClose() {
          return new Promise((resolve, reject) => {
            // mqtt connect with onConnected = resolve
            let mqttHelper = MqttHelper.getInstance()
            mqttHelper.close()
            resolve('closed')
          })
        },
        mqttSubscribe(topic) {
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.subscribe(topic)
          return null
        },
        mqttPublish(topic, payload) {
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.publish(topic, payload)
          return null
        },
        mqttGetTopicAndPayloads() {
          return new Promise((resolve) => {
            let mqttHelper = MqttHelper.getInstance()
            resolve(mqttHelper.getTopicAndPayloads())
          })
        },
        mqttResetTopicAndPayloads() {
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.resetTopicAndPayloads()
          return null
        },
        e2eServicesStart() {
          logStartup('e2eServicesStart')
          return startProcesses(
            [
              'cypress/servers/mosquitto',
              'cypress/servers/modbus2mqtt ' + config.env.modbus2mqttE2eHttpPort,
              'cypress/servers/modbus2mqtt ' + config.env.modbus2mqttAddonHttpPort + ' ' + localhost + ' :' + config.env.nginxAddonHttpPort,
            ],
            [
              config.env.mosquittoAuthMqttPort,
              config.env.mosquittoNoAuthMqttPort,
              config.env.modbus2mqttAddonHttpPort,
              config.env.modbus2mqttE2eHttpPort,
            ]
          )
        },
        e2eServicesStop() {
          logStartup('e2eServicesStop')
          return stopServices()
        },
        testWait() {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve('OK')
            }, 30000)
          })
        },
        getTempDir(args) {
          return new Promise((resolve, reject) => {
            let tmp = tmpdirs.find((t) => t.args.indexOf(args) >= 0)
            console.log(' args: ' + args + ' ' + JSON.stringify(tmpdirs) + (tmp ? 'found' : 'not found'))
            if (!tmp) reject(new Error('getTempDir: args not found  ' + args + ' ' + tmpdirs.length))
            else if (tmp.tmpdir) resolve(tmp.tmpdir)
            else reject(new Error('getTempDir: tmpdir not defined  ' + command))
          })
        },
        e2eStop() {
          return new Promise((resolve) => {
            logStartup('e2eStop')
            // initControllers.forEach(stopChildProcess)
            resetControllers.forEach(stopChildProcess)
            resolve('Stopped')
          })
        },
        log(msg) {
          console.log(msg)
          return 'OK'
        },
      })
    }
  },
    env: {
      logstartup: false, // Set to true to log startup services messages
      logservers: false,
      nginxAddonHttpPort: 3006, //nginx
      modbus2mqttAddonHttpPort: 3004, //ingress port
      modbusTcpHttpPort: 3002,
      modbus2mqttE2eHttpPort: 3005,
      mosquittoAuthMqttPort: 3001,
      mosquittoNoAuthMqttPort: 3003,
      mqttconnect: {
        mqttserverurl: 'mqtt://127.0.0.1:3001',
        username: 'homeassistant',
        password: 'homeassistant',
      }
    } //env
})
