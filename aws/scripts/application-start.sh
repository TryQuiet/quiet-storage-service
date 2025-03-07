cd /home/ubuntu/qss

source /home/ubuntu/.bashrc
ENVIRONMENT=$(TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"` && curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/Environment)
if [ $ENVIRONMENT == "Production" ]
then
  sudo pm2 --name QSS start pnpm -- start:prod
elif [ $ENVIRONMENT == "Development" ]
then
  sudo pm2 --name QSS start pnpm -- start:dev
else
  echo "Unknown environment: $ENVIRONMENT"
  exit 1
fi