cd /home/ec2-user/qss

source /home/ec2-user/.bashrc
ENVIRONMENT=$(TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"` && curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/Environment)
if [ $ENVIRONMENT == "Production" ]
then
  if [ sudo pm2 list | grep -q "QSS" ]
  then
    sudo pm2 restart QSS --cron-restart 0
  else
    sudo pm2 --name QSS start pnpm -- start:prod
  fi
elif [ $ENVIRONMENT == "Development" ]
then
  if [ sudo pm2 list | grep -q "QSS" ]
  then
    sudo pm2 restart QSS --cron-restart 0
  else
    sudo pm2 --name QSS start pnpm -- start:dev
  fi
else
  echo "Unknown environment: $ENVIRONMENT"
  exit 1
fi