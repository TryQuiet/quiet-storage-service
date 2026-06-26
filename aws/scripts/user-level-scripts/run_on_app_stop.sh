source ~/.bashrc

# stop the existing QSS process gracefully (if it exists)
echo "Checking for existing QSS service"
QSS_EXISTS=$(pm2 list | grep QSS)
if [ -n "$QSS_EXISTS" ]
then
  echo "Gracefully stopping existing QSS service"
  pm2 stop QSS
fi