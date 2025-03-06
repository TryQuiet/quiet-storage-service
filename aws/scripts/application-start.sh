cd /home/ubuntu/qss

ENVIRONMENT=$(TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"` && curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/Environment)
if [ $ENVIRONMENT == "Production" ]
then
  pm2 --name QSS start pnpm -- start:dist:prod
elif [ $ENVIRONMENT == "Development" ]
then
  pm2 --name QSS start pnpm -- start:dist:dev
else
  echo "Unknown environment: $ENVIRONMENT"
  exit 1
fi