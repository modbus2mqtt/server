#!/usr/bin/env python3
# import argparse
# import os
import re
import json
# import shutil
# import sys
# import tarfile
import subprocess

import repositories

# Assuming: This is a forked repository
# This will create the remote upstream if it doesn't exist
# it will merge upstream into the current branch

def get_user()->str:
    authStatus= json.loads(repositories.executeCommand(['gh', 'auth', 'status', '--json', 'hosts']))
    login = "N/A"
    for st in authStatus['hosts']['github.com']:
        if  st['active']:
            login = st['login']
            return st['login']
    return ""
   

repositories.executeSyncCommand( ["git", "config", "pull.rebase", "true"] )
login = get_user()
if login == 'modbus2mqtt':
    repositories.eprint('user modbus2mqtt is not supported')
    exit(2)

forked = json.loads(repositories.executeCommand(['gh', 'repo' , 'list', '--fork', '--json', 'name'] ))
branch =  subprocess.getoutput('git rev-parse --abbrev-ref HEAD')
url = repositories.executeCommand(['git','remote','get-url', "origin"]).decode('utf-8')
remoteUrl=re.sub(rf"{login}", 'modbus2mqtt',url)
repositories.executeCommand(['git','remote','add', "upstream",remoteUrl ])
repositories.eprint("Merging")
repositories.executeCommand(['git','fetch','upstream'])
repositories.executeCommand(['git','merge','upstream/main'])



#repository.remoteBranch = match.group(1)
