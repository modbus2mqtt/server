import subprocess
import sys
import os
from typing import List

def executeCommand(cmdArgs: List[str], *args, **kwargs) -> bytes:
    ignoreErrors = kwargs.get('ignoreErrors', None)
    result = subprocess.Popen(cmdArgs,
        cwd=os.getcwd(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE) 
    out, err = result.communicate()
    err = err.decode("utf-8")
    return_code = result.returncode
    if err != b'' and err != '' and not ignoreErrors:
        print(err, file=sys.stderr)
    if return_code != 0:
        if out != b'':
            print(out.decode("utf-8"), file=sys.stderr)
        return "".encode('utf-8')
    else:
        if out.decode("utf-8") == '':
            return '{"status": "OK"}'.encode('utf-8')
    return out

def executeSyncCommandWithCwd(cmdArgs: List[str], cwdP:str, *args, **kwargs)-> bytes:
    if cwdP is None:
        cwdP = os.getcwd()
    proc = subprocess.Popen(cmdArgs,
        cwd=cwdP,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE) 
    out, err = proc.communicate()
    if proc.returncode != 0:
        raise Exception( cwdP +':'+ err.decode("utf-8"), ' '.join(cmdArgs), out.decode("utf-8"))
    if len(err)>0:    
        print(err.decode("utf-8"), file=sys.stderr)
    return out

def executeCommandWithOutputs(cmdArgs: List[str], stdout, stderr,  *args, **kwargs):
    proc = subprocess.Popen(cmdArgs, stdout=stdout, stderr=stderr)
    proc.wait()
    if proc.returncode != 0:
        raise Exception( os.getcwd() +':'+' '.join(cmdArgs) + " exited with rc= " + str( proc.returncode))

def executeSyncCommand(cmdArgs: List[str], *args, **kwargs)-> bytes:
    return executeSyncCommandWithCwd(cmdArgs, os.getcwd(), *args, **kwargs)
