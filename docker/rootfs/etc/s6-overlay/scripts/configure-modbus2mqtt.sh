# if they are mounted, ensure required directories have correct ownership as 
# this script runs as root
# Migration from old config location /data/local to /config/modbus2mqtt
# If /config/modbus2mqtt does not exist, copy configuration from /data/local
# shellcheck disable=SC2012
if [ ! -d "/config/modbus2mqtt" ] || \
   [ ! -f "/config/modbus2mqtt/modbus2mqtt.yaml" ]  ||
   [ "$(find /config/modbus2mqtt/busses/bus.*/s*.yaml | wc -l)" = "0" ]
then
    mkdir -p /config/modbus2mqtt; 
    if [ -d /data/local ]  
    then 
      mkdir -p /config/modbus2mqtt; 
      echo "Migrating /data and /config to new command line 0.17.0+"
      cp -R /data/local/* /config/modbus2mqtt/; 
    fi
fi
mkdir -p /config/modbus2mqtt; 
[ ! -d "/data/public" ] && mkdir -p /data/public; 
chown -R modbus2mqtt:dialout /config/modbus2mqtt
chown -R modbus2mqtt:dialout /data/public
touch /ssl/secrets.txt
chown -R modbus2mqtt:dialout /ssl/secrets.txt
git config --global --add safe.directory /data/public
