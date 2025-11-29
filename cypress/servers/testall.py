#!/usr/bin/env python3

import argparse
import sys
from docker_utils import startDockerServers, killDockerContainer
from server_utils import killRequiredApps, startRequiredApps
from test_runner import testall

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("test", help="runs with npm ci instead of npm install", choices=["test", "startServers", "restartServers", "killServers", "startdocker"], default="test")
    parser.add_argument("--docker-image", default="ghcr.io/modbus2mqtt/modbus2mqtt:latest", help="Docker image (Repo-Name) for modbus2mqtt")
    parser.add_argument("-p", "--permanent", help="Start nginx and modbustcp server",  action='store_true')
    parser.add_argument("-r", "--restart", help="Start modbus2mqtt and mosquitto",  action='store_true')
    args, unknownargs = parser.parse_known_args()
    try:
        match args.test:
            case "test":
                testall("server")
            case  "restartServers":
                killRequiredApps(args.permanent, args.restart)
                startRequiredApps(args.permanent, args.restart)
                pass
            case  "startServers":
                startRequiredApps(args.permanent, args.restart)
                pass
            case "killServers":
                killRequiredApps(args.permanent, args.restart)
                killDockerContainer()
            case "startdocker":
                startDockerServers(args.docker_image)
    except Exception as err:
        print(str(err), file=sys.stderr)
        exit(2)

if __name__ == "__main__":
    main()
