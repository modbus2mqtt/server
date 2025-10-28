#!/usr/bin/env python3
import argparse
import re
import socket
import stat
import subprocess
import sys
import time
import os
from threading import Thread
import shutil
import tempfile
import argparse
class SyncException(Exception):
    pass

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def executeCommand(cmdArgs: list[str], *args, **kwargs)-> str:
    ignoreErrors = kwargs.get('ignoreErrors', None)
    result = subprocess.Popen(cmdArgs,
	cwd=os.getcwd(),
 	stdout=subprocess.PIPE,
 	stderr=subprocess.PIPE) 
    out, err = result.communicate()
    err = err.decode("utf-8")
    return_code = result.returncode
    if err != b'' and err != '' and not ignoreErrors:
        eprint(err)
    if return_code != 0:
        if out != b'':
            eprint(out.decode("utf-8"))
        return "".encode('utf-8')
    else:
        if out.decode("utf-8") == '':
            return '{"status": "OK"}'.encode('utf-8')
    return out

class StreamThread ( Thread ):
    def __init__(self, buffer):
        Thread.__init__(self)
        self.buffer = buffer
    def run ( self ):
        while 1:
            line = self.buffer.readline()
            eprint(line,end="")
            sys.stderr.flush()
            if line == '':
                break
def executeSyncCommandWithCwd(cmdArgs: list[str], cwdP:str, *args, **kwargs)-> str:
            
    if cwdP == None:
        cwdP = os.getcwd()
    proc = subprocess.Popen(cmdArgs,
    cwd=cwdP,
    stdout=subprocess.PIPE,
 	stderr=subprocess.PIPE) 
    out, err = proc.communicate()
    proc.returncode
    if proc.returncode != 0:
        raise SyncException( cwdP +':'+ err.decode("utf-8"), ' '.join(cmdArgs), out.decode("utf-8"))
    if len(err)>0:    
        eprint(err.decode("utf-8"))
    return out
def executeCommandWithOutputs(cmdArgs: list[str], stdout, stderr,  *args, **kwargs):
   proc = subprocess.Popen(cmdArgs, stdout=stdout, stderr=stderr)
   proc.wait()
   if proc.returncode != 0:
        raise SyncException( os.getcwd() +':'+' '.join(cmdArgs) + " exited with rc= " + str( proc.returncode))

def executeSyncCommand(cmdArgs: list[str], *args, **kwargs)-> str:
    return executeSyncCommandWithCwd(cmdArgs, os.getcwd(), *args, **kwargs)
   

def isOpen(ip,port):
   s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
   try:
      s.connect((ip, int(port)))
      s.shutdown(2)
      return True
   except:
      return False

def isCallable(command:str):
    try:
        nginxPath = executeSyncCommand(["which", command]).decode("utf-8")
    except Exception as err:
        raise SyncException( command + " must be installed!")
 
 
defaultMimeTypes = "/etc/nginx/mime.types"
defaultLibDir = "/var/lib/nginx"
    
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
            

def startRequiredApps():
    checkRequiredApps()
    with open( "./cypress/servers/nginx.conf/nginx.conf","r") as f:
        nginxConf = f.read()
        nginxConf = re.sub(r"mime.types", nginxGetMimesTypes(),nginxConf)
        # default directory
    fb = tempfile.NamedTemporaryFile(delete_on_close=False)
    fb.write( nginxConf.encode('utf-8'))
    fb.close()
    subprocess.Popen(["nohup", "nginx","-c",fb.name,"-p","."])
    subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbustcp"])
    for port in [3002,3006]:
        count=0
        while count < 12:            
            if not isOpen("localhost", port):
                time.sleep(1)
            else:
                break
            count += 1
        if count == 12:
            with open( "nohup.out") as f:
                eprint(f.read())
            eprint( executeSyncCommand(["pgrep", "-f", "nginx: master|runModbusTCP"]))
            raise SyncException("Port " + str(port) + " is not up")

def unlinkIfExist( file:str):
  if os.path.exists(file):
        os.unlink(file)
 
def killRequiredApps():
    print("::group::Cypress cleanup")
    try:
        executeSyncCommand(["pkill", "-f", "nginx: master|runModbusTCP"])
        unlinkIfExist("nginx.conf")
        unlinkIfExist("nohup.out" )
        unlinkIfExist("nginx.error.log" )
        unlinkIfExist("nginx.pid" )
    except:
        return 
    print( '::endgroup::' )

def testRepository(reponame:str):
    
    args = ["npm", 'run', 'test' ]
    # If there are jest tests, append reporters

    if os.path.exists("__tests__"):
        args = args +[ "--", "--reporters", "default", "--reporters",  "github-actions"]
    print("::group::Unit tests for " + reponame)
    executeCommandWithOutputs(args,sys.stderr, sys.stderr)
    print( '::endgroup::' )
    args = ["npm", 'run', 'cypress' ]
    # If there are jest tests, append reporters

    print("::group::Cypress Components tests for " + reponame)
    executeCommandWithOutputs(args,sys.stderr, sys.stderr)
    print( '::endgroup::' )

def testall(package:str)->bool:
    testRepository(package)
    if os.path.isdir(os.path.join("cypress", "e2e")):

            print("::group::Cypress run tests")
            executeCommandWithOutputs(["npx", "cypress", "run"],sys.stderr, sys.stdout)
            print( '::endgroup::' )
    else:
            eprint("No Cypress tests ín" + os.getcwd())

parser = argparse.ArgumentParser()
parser.add_argument("test", help="runs with npm ci instead of npm install", choices=["test", "startServers", "killServers"], default="test")

args, unknownargs = parser.parse_known_args()

try:   
    match args.test:
        case "test":
            testall("server")
        case  "startServers":
            startRequiredApps()
        case "killServers":
            killRequiredApps()
except SyncException as err1:
    eprint( ": " + err1.args[0])
    list = list(err1.args)   # Convert to list
    list.pop(0)
    for arg in list:
        eprint( arg)
    exit(2)
except Exception as err:
    for arg in err.args:
        eprint( arg)
    exit(2)