cd ~/qss

# install pnpm 10
# echo "Installing pnpm 10.6.0"
# npm install -g pnpm@10.6.0
# pnpm setup
# source ~/.bashrc

# install pm2
# echo "Installing pm2"
# pnpm add pm2@latest -g

# stop the existing QSS process gracefully
QSS_EXISTS=$(pm2 list | grep QSS)
if [ -n "$QSS_EXISTS" ]
then
  pm2 stop QSS
fi

# # delete the app directory and stop the service, if running
# echo "Stopping QSS service and deleting existing directory"
# sudo pm2 stop QSS
# rm -rf /home/ec2-user/qss

# install fluentd
# root soft nofile 65536
# root hard nofile 65536
# curl -fsSL https://fluentd.cdn.cncf.io/sh/install-amazon2023-fluent-package6-lts.sh | sh
# systemctl start fluentd.service

# install AWS CLI tools
# snap install aws-cli --classic
# aws --version
