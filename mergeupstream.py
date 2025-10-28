#!/usr/bin/env python3
# import argparse
# import os
import re
import json
# import shutil
import sys
# import tarfile
import os
import subprocess
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


# Assuming: This is a forked repository
# This will create the remote upstream if it doesn't exist
# it will merge upstream into the current branch

def get_user()->str:
    authStatus= json.loads(executeCommand(['gh', 'auth', 'status', '--json', 'hosts']))
    login = "N/A"
    for st in authStatus['hosts']['github.com']:
        if  st['active']:
            login = st['login']
            return st['login']
    return ""
   

executeCommand( ["git", "config", "pull.rebase", "true"] )
login = get_user()
if login == 'modbus2mqtt':
    eprint('user modbus2mqtt is not supported')
    exit(2)

forked = json.loads(executeCommand(['gh', 'repo' , 'list', '--fork', '--json', 'name'] ))
branch =  subprocess.getoutput('git rev-parse --abbrev-ref HEAD')
url = executeCommand(['git','remote','get-url', "origin"]).decode('utf-8')
remoteUrl=re.sub(rf"{login}", 'modbus2mqtt',url)
executeCommand(['git','remote','add', "upstream",remoteUrl ])
eprint("Merging")
executeCommand(['git','fetch','upstream'])
executeCommand(['git','merge','upstream/main'])
