cd /home/ec2-user/qss

sudo su

source /home/ec2-user/.bashrc
# ENVIRONMENT=$(TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"` && curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/Environment)
ENVIRONMENT=$(cat aws-environment.txt)
echo "Starting $ENVIRONMENT QSS"
if [ $ENVIRONMENT == "production" ]
then
  if [ $(pm2 list | grep -q "QSS") ]
  then
    echo "Existing QSS service, restarting"
    pm2 restart QSS --cron-restart 0
  else
    echo "No QSS service found, starting a new service instance"
    pm2 --name QSS start pnpm -- start:prod
  fi
elif [ $ENVIRONMENT == "development" ]
then
  if [ $(pm2 list | grep -q "QSS") ]
  then
    echo "Existing QSS service, restarting"
    pm2 restart QSS --cron-restart 0
  else
    echo "No QSS service found, starting a new service instance"
    pm2 --name QSS start pnpm -- start:dev
  fi
else
  echo "Unknown environment: $ENVIRONMENT"
  exit 1
fi