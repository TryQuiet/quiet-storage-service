cd /home/ubuntu/qss

source /home/ubuntu/.bashrc

# pnpm run bootstrap

ENVIRONMENT=$(TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"` && curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/Environment)
if [ $ENVIRONMENT == "Production" ]
then
  pnpm run migrate:up:prod
elif [ $ENVIRONMENT == "Development" ]
then
  pnpm run migrate:up:dev
else
  echo "Unknown environment: $ENVIRONMENT"
  exit 1
fi
