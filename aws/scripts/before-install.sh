cd ~/qss

# install node 22
echo "Installing node 22.14.0"
sudo yum install -y curl
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo yum install -y nodejs
node -v

# install pnpm 10
echo "Installing pnpm 10.6.0"
npm install -g pnpm@10.6.0
pnpm setup
source ~/.bashrc

# install pm2
echo "Installing pm2"
pnpm add pm2@latest -g

# # delete the app directory and stop the service, if running
# echo "Stopping QSS service and deleting existing directory"
# sudo pm2 stop QSS
# rm -rf /home/ec2-user/qss

# install fluentd
root soft nofile 65536
root hard nofile 65536
curl -fsSL https://fluentd.cdn.cncf.io/sh/install-amazon2023-fluent-package6-lts.sh | sh
sudo systemctl start fluentd.service

# install AWS CLI tools
sudo snap install aws-cli --classic
aws --version
