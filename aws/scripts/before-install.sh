cd ~

# install node 22
curl -sL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt-get install -y nodejs

# install pnpm 10
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=10.4.1 sh -

npm install pm2@latest -g

pm2 stop QSS
rm -rf /home/ubuntu/qss
