cd ~

# install node 22
echo "Installing node 22.14.0"
curl -sL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt-get install -y nodejs

# install pnpm 10
echo "Installing pnpm 10.6.0"
npm install -g pnpm@10.6.0
pnpm setup

# install pm2
echo "Installing pm2"
pnpm add pm2@latest -g

# delete the app directory and stop the service, if running
echo "Stopping QSS service and deleting existing directory"
pm2 stop QSS
rm -rf /home/ubuntu/qss
