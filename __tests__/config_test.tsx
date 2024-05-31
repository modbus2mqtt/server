import { expect } from '@jest/globals';
import { Config, MqttValidationResult } from '../src/config';
import {  SpecificationStatus, getFileNameFromName, getSpecificationI18nName, newSpecification } from 'specification.shared';
import * as fs from 'fs';
import { join } from 'path';
import { yamlDir } from './../testHelpers/configsbase';
import * as http from 'http'
import { AuthenticationErrors } from 'server.shared';


Config['yamlDir'] = yamlDir;
Config.sslDir = yamlDir;


afterAll(() => {
    let cfg = Config.getConfiguration()
    new Config().writeConfiguration(cfg)
})


it('register/login/validate', (done) => {
    const config = new Config();
    let loginExecuted: boolean = false;
    config.readYaml();
    let cfg = Config.getConfiguration()
    Config.tokenExpiryTime = 2000
    new Config().writeConfiguration(cfg)
    Config.register("test", "test123").then(() => {
        Config.login("test", "test123").then(token => {
            expect(Config.validateUserToken(token)).toBe(MqttValidationResult.OK)
            setTimeout(() => {
                expect(Config.validateUserToken(token)).toBe(MqttValidationResult.tokenExpired)
                done();
                loginExecuted = true;
            }, Config.tokenExpiryTime);

        })
        Config.login("test", "test124").catch(reason => {
            expect(reason).toBe(AuthenticationErrors.InvalidUserPasswordCombination)
            if (loginExecuted)
                done();
        })
    })
});

it('getFileNameFromName remove non ascii characters', () => {
    const name = "/\\*& asdf+-_.";
    let fn = getFileNameFromName(name);
    console.log(fn);
    expect(fn).toBe("asdf+-_.");
});

it('writeConfiguration change password ', () => {
    let cr = new Config();
    let cfg = Config.getConfiguration();
    let oldpassword = cfg.mqttconnect.password;
    cfg.mqttconnect.password = "testpassword";
    cr.writeConfiguration(cfg);
    expect(Config['config'].mqttconnect.password).toBe("testpassword");
    expect(cfg.mqttconnect.password).toBe("testpassword"); // from secrets.yaml
    let cfgStr = fs.readFileSync(yamlDir + "/local/modbus2mqtt.yaml").toString();
    expect(cfgStr).toContain("!secret ");
    cfg.mqttconnect.password = oldpassword;
    cr.writeConfiguration(cfg);
    expect(Config['config'].mqttconnect.password).toBe(oldpassword);
    cfgStr = fs.readFileSync(yamlDir + "/local/modbus2mqtt.yaml").toString();
    expect(cfgStr).toContain("!secret ");
    let secretsStr = fs.readFileSync(yamlDir + "/local/secrets.yaml").toString();
    expect(secretsStr).toContain(oldpassword);

});


const mqttService = {
    "host": "core-mosquitto",
    "port": 1883,
    "ssl": false,
    "protocol": "3.1.1",
    "username": "addons",
    "password": "Euso6ahphaiWei9Aeli6Tei0si2paep5agethohboophe7vae9uc0iebeezohg8e",
    "addon": "core_mosquitto"
}
var mockedMqttResolve = true;
var mockedReason = "Failed to get HASSIO MQTT Data"
function mockedMqtt(_param: any): Promise<any> {

    return new Promise<any>((resolve, reject) => {
        if (mockedMqttResolve)
            resolve(mqttService)
        else
            reject(mockedReason)
    })
}
function mockedHttp(_options: any, cb: () => any) {
    cb();
}
it('getMqttConnectOptions: read connection from hassio', (done) => {
    let cfg = new Config()
    process.env.HASSIO_TOKEN = "test"
    let origReadMqttGet = Config.prototype.readGetResponse
    let originalHttpRequest = http.request
    Config.prototype.readGetResponse = mockedMqtt
    Object.defineProperty(http, "request", {
        value: mockedHttp,
        configurable: true,
        writable: true
    });

    cfg.readYaml();
    cfg.getMqttConnectOptions().then((_mqttData) => {

        expect(_mqttData.host).toBe(mqttService.host)
        expect(_mqttData.username).toBe(mqttService.username)
        expect(_mqttData.host).toBe(mqttService.host)
        mockedMqttResolve = false
        cfg.getMqttConnectOptions().catch((reason) => {

            expect(reason).toBe(mockedReason)
            // Restore class
            process.env.HASSIO_TOKEN = "";
            Config.prototype.readGetResponse = origReadMqttGet
            Object.defineProperty(http, "request", {
                value: originalHttpRequest,
                configurable: true,
                writable: true
            });
            done()
        })


    })
})

