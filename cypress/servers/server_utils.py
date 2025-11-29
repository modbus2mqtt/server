import glob
import re
import shutil
import subprocess
import os
import sys
import tempfile
import time
from command_utils import executeSyncCommand
defaultMimeTypes = "/etc/nginx/mime.types"
defaultLibDir = "/var/lib/nginx"
MAX_PORT_RETRIES = 12
PERMANENT_PORTS = [3002, 3006]
RESTART_PORTS = [3001, 3003, 3004, 3005, 3007]

class SyncException(Exception):
    pass
def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def isOpen(ip: str, port: int) -> bool:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.connect((ip, int(port)))
        s.shutdown(2)
        return True
    except (socket.error, ConnectionRefusedError):
        return False

def isCallable(command:str):
    try:
        executeSyncCommand(["which", command]).decode("utf-8")
    except Exception:
        raise Exception(command + " must be installed!")

def unlinkIfExist(file:str):
    if os.path.exists(file):
        os.unlink(file)

def killOne(app:str):
    try:
        executeSyncCommand(["pkill",  "-U", str(os.getuid()) ,"-f", app])
        print(f"Killed {app}")
    except Exception:
        print(f"No running process found for {app}")
        
def killRequiredApps(permanent:bool=False, restart:bool=False):
    print("::group::Cypress cleanup")
    try:
        if(not restart):
            killOne("nginx: master")
            killOne("runModbusTCP")
            unlinkIfExist("nginx.conf")
            unlinkIfExist("nginx.pid" )
            unlinkIfExist("nginx.error.log" )
        
        if(not permanent or restart):
            killOne("modbus2mqtt")
            killOne("mosquitto")
            unlinkIfExist("cypress/servers/tmpfiles" )
        unlinkIfExist("nohup.out" )
    finally:
        print( '::endgroup::' )
def nginxGetMimesTypes():
    if  not os.path.exists(defaultMimeTypes):
        return "/opt/homebrew/" + defaultMimeTypes
    return defaultMimeTypes
        
def nginxGetLibDir():
    if  not os.path.isdir(defaultLibDir):
         return "/opt/homebrew/var/homebrew/linked/nginx"
    return defaultLibDir
def checkRequiredApps():
    # nginx must be preinstalled
    isCallable("nginx")
    ngxinlib = nginxGetLibDir()
    if not os.path.isdir(ngxinlib) :
        raise SyncException( nginxGetLibDir() + " directory not found!") 
 
def startRequiredApps(permanent:bool, restart:bool):
    try:
        shutil.rmtree("./distprod")
    except OSError:
        pass  
    try:
        for f in glob.glob("modbus2mqtt-*.tgz"):
            os.remove( f)
    except OSError:
        pass
    if( not permanent):
        print("::group::start npm pack and install modbus2mqtt")
        try:
            executeSyncCommand(["npm","run", "build"]).decode('utf-8').strip()
            executeSyncCommand(["npm","pack", "--silent"]).decode('utf-8').strip()
        except Exception as err:
            eprint("npm pack failed: " + str(err))
            raise SyncException("npm pack failed")  
        eprint("npm pack succeeded ")
        os.mkdir("./distprod")
        os.chdir("./distprod")
        eprint("npm init -y")
        executeSyncCommand(["npm","init","-y", "--silent"])
        eprint("npm installing modbus2mqtt")
        for f in glob.glob("../modbus2mqtt-*.tgz"):
            try:
                executeSyncCommand(["npm","install" , "--silent", f ] )
            except Exception as err:
                eprint("npm install failed: " + str(err))
                raise SyncException("npm install failed")
        os.chdir("..")
        # kill existing apps
        print( '::endgroup::' )
    print("::group::start Start required servers")
    if( not restart):
        checkRequiredApps()
        with open( "./cypress/servers/nginx.conf/nginx.conf","r") as f:
            nginxConf = f.read()
            nginxConf = re.sub(r"mime.types", nginxGetMimesTypes(),nginxConf)
        # default directory
        fb = tempfile.NamedTemporaryFile(delete_on_close=False)
        fb.write( nginxConf.encode('utf-8'))
        fb.close()
    if( not permanent):
        file="cypress/servers/tmpfiles"
        if os.path.exists(file):
            os.remove(file )
    with open('stderr.out', "a") as outfile:
        if( not restart):
            subprocess.Popen(["nohup", "nginx","-c",fb.name,"-p","."],stderr=outfile, stdout=outfile)
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbustcp"],stderr=outfile, stdout=outfile)
        if( not permanent or restart):
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/mosquitto"],stderr=outfile, stdout=outfile)
            # use modbus2mqtt with different config files
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbus2mqtt 3005 " + file],stderr=outfile, stdout=outfile)  # e2ePort
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbus2mqtt 3004 "  + file + " localhost:3006"],stderr=outfile, stdout=outfile) 
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbus2mqtt 3007 " + file],stderr=outfile, stdout=outfile)  # mqttNoAuthPort
            # Use docker host port
        if( permanent):
            ports = PERMANENT_PORTS
        elif( restart):
            ports = RESTART_PORTS
        else:
            ports = PERMANENT_PORTS + RESTART_PORTS
        eprint("Waiting for " + str(ports) + " to open")
        error=""
        for port in ports:
            count=0
            while count < MAX_PORT_RETRIES:            
                if not isOpen("localhost", port):
                    time.sleep(1)
                else:
                    break
                count += 1
            if count == MAX_PORT_RETRIES:
                if(os.path.exists("stderr.out")):
                    with open( "stderr.out") as f:
                        eprint(f.read())
                error += f"Port {port} not opened!\n"
        if( error != ""):
            raise SyncException( error)
        else:
            eprint("All required ports are open.")
        outfile.close()
        print( '::endgroup::' )
        unlinkIfExist("stderr.out")
