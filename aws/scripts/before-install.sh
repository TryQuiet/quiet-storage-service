cd ~
curl -sL https://deb.nodesource.com/setup_18.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install nodejs -y

npm install pm2@latest -g

pm2 stop QSS
rm -rf /home/ubuntu/qss
