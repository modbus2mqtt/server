import { Command } from "commander";
import { addRegisterValue, logValues, runModbusServer } from "./modbusTCPserver";
import { VERSION } from "ts-node";
import * as fs from 'fs';
import { join } from "path";
import { parse } from 'yaml';
import { IfileSpecification } from "specification";
import { ModbusRegisterType } from "specification.shared";
import Debug from "debug"
import { IBus, IModbusConnection, ITCPConnection } from "server.shared";
const debug = Debug("modbusTCPserver");


export function  startModbusTCPserver(yamlDir:string, busId:number){
    debug("starting")
    let directoryBus = join( yamlDir , 'local/busses/bus.' + busId )
    let directoryPublicSpecs = join( yamlDir , 'public/specifications' )
    let directoryLocalSpecs = join( yamlDir , 'local/specifications' )
    console.log("read bus" + directoryBus)
    let files = fs.readdirSync(directoryBus);
    let port =0
    files.forEach( slaveFileName=>{
        if( slaveFileName == ("bus.yaml")){
            let content = fs.readFileSync(join(directoryBus,slaveFileName), { encoding: 'utf8' })
            let connection:IModbusConnection = parse(content.toString())
        if( (connection as ITCPConnection).port )
                port = (connection as ITCPConnection).port 
        }

        if(slaveFileName.startsWith("s"))
            try {
                console.log("read slave" + slaveFileName)
                let content = fs.readFileSync(join(directoryBus,slaveFileName), { encoding: 'utf8' })
                let slave = parse(content.toString())
                let slaveid= slave.slaveid
                let specFilename = slave.specificationid
                if(specFilename){
                    let fn = join( directoryLocalSpecs, specFilename + ".yaml" )
                    console.log(fn)
                    content = fs.readFileSync(fn, { encoding: 'utf8' })
                    let spec:IfileSpecification = parse(content.toString())
                
                    if(spec.testdata){
                        let testdata = spec.testdata
                        if(spec.testdata.analogInputs)
                            spec.testdata.analogInputs.forEach(avp=>{
                            let a = avp.address
                            addRegisterValue(slaveid,a,ModbusRegisterType.AnalogInputs,avp.value)
                        })
                        if(spec.testdata.holdingRegisters)
                            spec.testdata.holdingRegisters.forEach(avp=>{
                            let a = avp.address
                            addRegisterValue(slaveid,a,ModbusRegisterType.HoldingRegister,avp.value)
                        })
                        if(spec.testdata.coils)
                            spec.testdata.coils.forEach(avp=>{
                            let a = avp.address
                            addRegisterValue(slaveid,a,ModbusRegisterType.Coils,avp.value)
                        })                        
                    }
                
                }
                logValues()
            } catch (e: any) {
                console.error("Unable to read  directory for " + e)
            }
    })
    runModbusServer(port)
}

