'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const mqtt = require('mqtt')
let instance = undefined

exports.MqttHelper = void 0
function getInstance() {
  if (instance == undefined) {
    console.log('call new')
    instance = new MqttHelper()
    if (instance.tAndP == undefined) console.log('After new tAndP is undefined')
  }
  return instance
}
class MqttHelper {
  client
  tAndP
  connectionData
  constructor() {
    this.tAndP = []
  }

  onMessage(topic, payload, packet) {
    console.log('onMessage id:' + packet.messageId + ' topic:' + topic + ' payload: ' + payload.toString())
    if (this.tAndP && !this.tAndP.find((tp) => tp.messageId == packet.messageId)) {
      console.log('onMessage id:' + packet.messageId + ' topic:' + topic + ' payload: ' + payload.toString())
      this.tAndP.push({ topic: topic, payload: payload.toString(), messageId: packet.messageId })
    }
  }
  onError(e) {
    console.log('MQTT Helper error ' + e.message)
  }
  onClose() {
    console.log('MQTT connection closed')
  }
  onReconnect() {
    console.log('Reconnecting')
    this.client.removeAllListeners('error')
    this.client.removeAllListeners('message')
    this.client.removeAllListeners('reconnect')
    this.client.on('error', this.onError.bind(this))
    this.client.on('message', this.onMessage.bind(this))
    this.client.on('reconnect', this.onReconnect.bind(this, this.client))
  }
  close() {
    if( this.client )
        this.client.end()
  }
  connect(connectionData) {
    this.connectionData = structuredClone(connectionData)
    this.connectionData.clean = false
    this.connectionData.reconnectPeriod = 5000
    this.connectionData.clientId = 'm2mCypress'

    return new Promise((resolve, reject) => {
      if (this.client)
        if (this.client.connected) {
          resolve(this.client)
          return
        } else this.client.reconnect(this.connectionData)
      else this.client = mqtt.connect(connectionData.mqttserverurl, this.connectionData)
      this.client.on('error', (e) => {
        this.onError(e)
        reject(e)
      })
      this.client.on('message', this.onMessage.bind(this))
      this.client.on('connect', () => {
        resolve(this.client)
      })
      this.client.on('reconnect', this.onReconnect.bind(this, this.client))
      this.client.on('close', this.onClose.bind(this, this.client))
    })
  }
  publish(topic, payload) {
    this.connect(this.connectionData).then((mqttClient) => {
      mqttClient.publish(topic, payload, { qos: 1 })
    })
  }
  subscribe(topic) {
    this.connect(this.connectionData)
      .then((mqttClient) => {
        this.client.subscribe(topic, { qos: 1 })
      })
      .catch((e) => {
        console.log('Unable to subscribe ' + e.message)
      })
  }
  getTopicAndPayloads() {
    return new Promise((resolve, reject) => {
      this.connect(this.connectionData)
        .then(() => {
          resolve(this.tAndP)
        })
        .catch(reject)
    })
  }
  resetTopicAndPayloads() {
    if (this.tAndP == undefined) console.log('resetTopicAndPayloads this.tAndP is undefined')
    this.tAndP = []
  }
}
exports.getInstance = getInstance
exports.MqttHelper = MqttHelper
