cd /home/ec2-user/qss

source /home/ec2-user/.bashrc

echo "Bootstrapping QSS"

sudo su
rm -rf dist/
rm -rf node_modules/

pnpm run bootstrap:deployed

# ENVIRONMENT=$(TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"` && curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/Environment)
ENVIRONMENT=$(cat aws-environment.txt)
if [ $ENVIRONMENT == "production" ]
then
  echo "Running production migrations"
  pnpm run --filter app migrate:up:prod
elif [ $ENVIRONMENT == "development" ]
then
  echo "Running development migrations"
  pnpm run --filter app migrate:up:dev
else
  echo "Unknown environment: $ENVIRONMENT"
  exit 1
fi
