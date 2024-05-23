import { ImodbusSpecification, Ispecification } from 'specification.shared';
import { ConfigSpecification, ConverterMap, M2mSpecification } from "specification";
import { Ientity, ImodbusEntity, FCOffset } from 'specification.shared';
import { Config } from "./config";
import { ModbusCache } from "./modbuscache";
import { Observable, Subject } from "rxjs";
import { Bus } from "./bus";
import { submitGetHoldingRegisterRequest } from "./submitRequestMock";
import { IfileSpecification } from "specification";
import { LogLevelEnum, Logger } from 'specification';
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU';
const debug = require('debug')('modbus');
const debugAction = require('debug')('actions');

const log = new Logger('modbus')
export class Modbus {
    constructor() {
    }

    writeEntityModbus(bus: Bus, slaveid: number, entity: Ientity, modbusValue: ReadRegisterResult) {
        // this.modbusClient.setID(device.slaveid);
        if (entity.modbusAddress && entity.functionCode) {
            new ModbusCache("write").
                writeRegisters({ busid: bus.getId(), slaveid: slaveid }, M2mSpecification.getModbusAddressFCFromEntity(entity), modbusValue, () => {
                    // writeRegisters done
                }, (e: any) => {
                    log.log(LogLevelEnum.error, e.message);
                });
        }
    }

    writeEntityMqtt(bus: Bus, slaveid: number, spec: Ispecification, entityid: number, mqttValue: string): Promise<string> {
        let rc = new Promise<string>((resolve, reject) => {

            // this.modbusClient.setID(device.slaveid);
            let entity = spec.entities.find(ent => ent.id == entityid)
            if (entity) {
                let converter = ConverterMap.getConverter(entity)
                if (entity.modbusAddress && entity.functionCode && converter) {
                    let modbusValue = converter?.mqtt2modbus(spec, entityid, mqttValue)
                    if (modbusValue && modbusValue.data.length > 0) {
                        new ModbusCache("write").
                            writeRegisters({ busid: bus.getId(), slaveid: slaveid }, M2mSpecification.getModbusAddressFCFromEntity(entity), modbusValue, () => {
                                resolve(mqttValue)
                            }, (e: any) => {
                                log.log(LogLevelEnum.error, e.message);
                                reject(e.message)
                            });
                    }
                    else
                        reject("No modbus address or function code or converter not found for entity " + entityid + " ")
                }
                else
                    reject("No modbus address or function code for entity " + entityid + " ")
            } else
                reject("Entity not found in Specification entityid: " + entityid + JSON.stringify(spec))
        })
        return rc
    }
    readEntityFromModbus(bus: Bus, slaveid: number, spec: Ispecification, entityId: number, failedFunction: (e: any) => void): Observable<ImodbusEntity> {
        let entity = spec.entities.find(ent => ent.id == entityId)
        let rc = new Subject<ImodbusEntity>()
        if (entity && entity.modbusAddress && entity.functionCode) {
            let converter = ConverterMap.getConverter(entity);
            if (converter) {
                let addresses = new Set<number>();
                for (let i = entity.modbusAddress; i < entity.modbusAddress + converter.getModbusLength(entity); i++)
                    addresses.add(i + FCOffset * entity.functionCode);
                let fn = (async () => {
                    let rcf = (results: Map<number, ReadRegisterResult>) => {
                        debug("Modbus: readEntity " + results.values.length);
                        let em = M2mSpecification.copyModbusDataToEntity(spec, entity!.id, results);
                        if (em)
                            rc.next(em);
                        else
                            failedFunction(new Error("Unable to copy ModbusData to Entity"))
                    }
                    if (Config.getConfiguration().fakeModbus)
                        submitGetHoldingRegisterRequest({ busid: bus.getId(), slaveid: slaveid }, addresses, rcf, failedFunction)
                    else
                        bus.readModbusRegister("readEntity", slaveid, addresses, rcf, failedFunction)
                });

                setTimeout(fn, 1);
            }
        }
        else {
            let msg = "Bus " + bus.properties.busId + " has no configured Specification"
            log.log(LogLevelEnum.notice, msg);
            failedFunction(new Error(msg));
        }
        return rc;
    }

    

    /*
     * iterates over slave ids starting at slaveid = 1. If one of the holding registers 0,1,2 or 3 returns a value, the slave id is considered to have an attached device.
     * Now, the method tries to find specifications which are supported by the device.
     * So, even if a device was not recognized, but the modbus registers of all identifying entities are available, the slaveId will be considered to hava an attached device.
     * The result, contains an array of all slaveids with an attached device. 
     * Additionally it contains an array of public specifications matching the modbus registers of the device plus all local specifications.
     */

    private static populateEntitiesForSpecification(specification: IfileSpecification, values: Map<number, ReadRegisterResult>, sub: Subject<ImodbusSpecification>) {
        let mspec = M2mSpecification.fileToModbusSpecification(specification!,values);
        if (mspec)
            sub.next(mspec);

    }
   
    static getModbusSpecificationFromData(task: string, bus: Bus, slaveid: number, specification: IfileSpecification, sub: Subject<ImodbusSpecification>): void {
        let addresses = new Set<number>()
        let info = "(" + bus.getId() + "," + slaveid + ")"
        Bus.getModbusAddressesForSpec(specification, addresses);
        setTimeout(async () => {

            debugAction("getModbusSpecificationFromData start read from modbus")
            bus.readModbusRegister(task, slaveid, addresses, (values => {
                debugAction("getModbusSpecificationFromData end read from modbus")
                Modbus.populateEntitiesForSpecification(specification!, values, sub)
            }), (e) => {
                // read modbus data failed.
                log.log(LogLevelEnum.error, "Modbus Read " + info + " failed: " + e.message)
                Modbus.populateEntitiesForSpecification(specification!, new Map<number, ReadRegisterResult>(), sub)
            })
        }, 1)

    }
    static getModbusSpecification(task: string, bus: Bus, slaveid: number, specificationFilename: string | undefined, failedFunction: (e: any) => void): Observable<ImodbusSpecification> {
        debugAction("getModbusSpecification starts (" + bus.getId() + "," + slaveid + ")")
        let rc = new Subject<ImodbusSpecification>()
        if (!specificationFilename || specificationFilename.length == 0) {
            let slave = bus.getSlaveBySlaveId(slaveid)
            if (slave && slave.specificationid && slave.specificationid.length > 0)
                specificationFilename = slave.specificationid
        }
        if (specificationFilename) {
            let spec = ConfigSpecification.getSpecificationByFilename(specificationFilename);
            if (spec) {
                Modbus.getModbusSpecificationFromData(task, bus, slaveid, spec, rc)
            }
            else {
                let msg = "No specification passed  " + specificationFilename;
                failedFunction(new Error(msg))
            }
        } else {
            let msg = "No specification passed to  getModbusSpecification";
            debug(msg);
            failedFunction(new Error(msg))
        }
        return rc;
    }
}

export class ModbusForTest extends Modbus {
    modbusDataToSpecForTest(spec: IfileSpecification): ImodbusSpecification | undefined {
        return M2mSpecification.fileToModbusSpecification(spec);
    }
}