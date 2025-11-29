
import shutil
import subprocess
import tempfile
import os
import re

def check_container_permissions(container_name="modbus2mqtt-test"):
    import subprocess
    # 1. Check if /config/modbus2mqtt is writable by user modbus2mqtt (as root, using stat)
    stat1 = [
        "docker", "exec", container_name,
        "stat", "-c", "%U %A", "/config/modbus2mqtt"
    ]
    stat2 = [
        "docker", "exec", container_name,
        "stat", "-c", "%U %A", "/data/public"
    ]
    def is_writable(stat_out, user):
        # stat_out: e.g. 'modbus2mqtt drwxrwxr-x'
        parts = stat_out.strip().split()
        if len(parts) != 2:
            return False
        owner, perms = parts
        # owner write: perms[2] == 'w', group write: perms[5] == 'w', other write: perms[8] == 'w'
        if owner == user and perms[2] == 'w':
            return True
        if perms[5] == 'w' or perms[8] == 'w':
            return True
        return False
    try:
        out1 = subprocess.check_output(stat1, text=True)
        if not is_writable(out1, "modbus2mqtt"):
            raise RuntimeError("/config/modbus2mqtt is not writable by user modbus2mqtt!")
    except subprocess.CalledProcessError:
        raise RuntimeError("/config/modbus2mqtt does not exist or stat failed!")
    try:
        out2 = subprocess.check_output(stat2, text=True)
        if not is_writable(out2, "modbus2mqtt"):
            raise RuntimeError("/data/public is not writable by user modbus2mqtt!")
    except subprocess.CalledProcessError:
        raise RuntimeError("/data/public does not exist or stat failed!")
    # Git check removed: No informative value for container permission check.
def docker_restart_container(container_name="modbus2mqtt-test"):
    try:
        subprocess.check_call(["docker", "restart", container_name])
    except Exception as e:
        raise RuntimeError(f"Error restarting container {container_name}: {e}") 
        
def copy_config_to_container(local_path="cypress/servers/modbustcp.conf/config-dir", container_name="modbus2mqtt-test", container_target="/config/modbus2mqtt"):

    # Check if container is running
    try:
        result = subprocess.run([
            "docker", "inspect", "-f", "{{.State.Running}}", container_name
        ], capture_output=True, text=True, check=True)
        if result.stdout.strip() != "true":
            raise RuntimeError(f"Container {container_name} is not running!")
    except subprocess.CalledProcessError:
        raise RuntimeError(f"Container {container_name} does not exist!")

    # Copy file or directory into container
    try:
        subprocess.check_call([
            "docker", "cp", local_path, f"{container_name}:{container_target}"
        ])
        # chown: forward all output to stderr
        subprocess.check_call([
            "docker", "exec", container_name,
            "chown", "-R", "modbus2mqtt:dialout", container_target
        ], stderr=None)
    except Exception as e:
        raise RuntimeError(f"Error copying to container: {e}")
    
def startDockerServers(docker_image=None):
    if docker_image is None:
        docker_image = "ghcr.io/modbus2mqtt/modbus2mqtt:latest"
    print("::group::Start modbustcp and mosquitto (local)")
    checkRequiredApps()
    with open("./cypress/servers/nginx.conf/nginx.conf", "r") as f:
        nginxConf = f.read()
        nginxConf = re.sub(r"mime.types", nginxGetMimesTypes(), nginxConf)
    fb = tempfile.NamedTemporaryFile(delete_on_close=False)
    fb.write(nginxConf.encode('utf-8'))
    fb.close()
    tmpfile = "cypress/servers/tmpfiles"
    if os.path.exists(tmpfile):
        os.remove(tmpfile)
    with open('stderr.out', "a") as outfile:
        subprocess.Popen(["nohup", "nginx", "-c", fb.name, "-p", "."], stderr=outfile, stdout=outfile)
        subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbustcp"], stderr=outfile, stdout=outfile)
        subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/mosquitto"], stderr=outfile, stdout=outfile)
    print('::endgroup::')
    print("::group::Start modbus2mqtt in Docker")
    ssl_dir = tempfile.mkdtemp(prefix="modbus2mqtt-ssl-")
    data_dir = tempfile.mkdtemp(prefix="modbus2mqtt-data-")
    config_dir = tempfile.mkdtemp(prefix="modbus2mqtt-config-")
    docker_cmd = [
        "docker", "run", "-d",
        "--name", "modbus2mqtt-test",
        "-p", "3007:3000",
        "-v", f"{ssl_dir}:/ssl",
        "-v", f"{data_dir}:/data",
        "-v", f"{config_dir}:/config",
        docker_image
    ]
    try:
        subprocess.check_call(["docker", "rm", "-f", "modbus2mqtt-test"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
    print(f"Running: {' '.join(docker_cmd)}")
    subprocess.check_call(docker_cmd)
    copy_config_to_container()
    copy_config_to_container( local_path="cypress/servers/modbus2mqtt-docker.yaml", container_target="/config/modbus2mqtt/modbus2mqtt.yaml")
    check_container_permissions()
    docker_restart_container()
    print('::endgroup::')

def killDockerContainer():
    try:
        subprocess.check_call(["docker", "rm", "-f", "modbus2mqtt-test"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Killed Docker container: modbus2mqtt-test")
    except Exception:
        print("No running Docker container found: modbus2mqtt-test")

def checkRequiredApps():
    # Dummy-Implementierung, bitte aus main übernehmen
    pass

def nginxGetMimesTypes():
    # Dummy-Implementierung, bitte aus main übernehmen
    return "/etc/nginx/mime.types"
