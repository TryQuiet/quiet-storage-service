set -e

cd /home/qss-user/qss

source ~/.bashrc

echo "Clearing generated files"

rm -rf dist/
rm -rf node_modules/

echo "Bootstrapping QSS"

pnpm run bootstrap:deployed

echo "Running database migrations"

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

echo "Starting $ENVIRONMENT QSS"
QSS_EXISTS=$(pm2 list | grep QSS)
if [ $ENVIRONMENT == "production" ]
then
  if [ -n "$QSS_EXISTS" ]
  then
    echo "Existing QSS service, restarting"
    pm2 restart QSS --cron-restart 0
  else
    echo "No QSS service found, starting a new service instance"
    pm2 --name QSS start pnpm -- start:prod --kill-timeout 45000
    pm2 save
  fi
elif [ $ENVIRONMENT == "development" ]
then
  if [ -n "$QSS_EXISTS" ]
  then
    echo "Existing QSS service, restarting"
    pm2 restart QSS --cron-restart 0
  else
    echo "No QSS service found, starting a new service instance"
    pm2 --name QSS start pnpm -- start:dev --kill-timeout 45000
    pm2 save
  fi
else
  echo "Unknown environment: $ENVIRONMENT"
  exit 1
fi