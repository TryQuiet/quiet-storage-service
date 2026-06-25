#!/bin/bash

###### This script is run as part of the AMI build process

echo -e "Starting server init\n"

### Root Setup

echo -e "!! Running root setup !!\n"

# get installed packages up to date
echo -e "Updating installed packages\n"
sudo yum update -y

# ensure AWS tooling
echo -e "Installing AWS tools\n"
sudo yum install -y amazon-cloudwatch-agent
sudo yum install -y amazon-ssm-agent
sudo yum install -y aws-cli

# install other necessary packages
echo -e "Install curl\n"
sudo yum install -y curl

# install fluentd and start the service
echo -e "Installing fluentd\n"
curl -fsSL https://fluentd.cdn.cncf.io/sh/install-amazon2023-fluent-package6-lts.sh | sh
echo -e "Initializing fluentd service\n"
sudo systemctl start fluentd.service

# install node 22
echo -e "Installing Node 22.x\n"
curl -sL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo yum install -y nodejs

# add QSS user
echo -e "Creating QSS user\n"
sudo useradd qss-user

# update /etc/security/limits.conf for root and the qss user
echo -e "Setting file limits for root\n"
echo "root soft nofile 65536" >> /etc/security/limits.conf
echo "root hard nofile 65536" >> /etc/security/limits.conf
echo -e "Setting file limits for qss-user\n"
echo "qss-user soft nofile 65536" >> /etc/security/limits.conf
echo "qss-user hard nofile 65536" >> /etc/security/limits.conf

# allow QSS to write logs
echo -e "Setting permissions for QSS logs\n"
mkdir /var/log/qss
sudo chown -R qss-user /var/log/qss

### QSS User Setup

echo -e "!! Running QSS user setup !!\n"

# initial setup for node
echo -e "Updating env for running node on QSS user\n"
runuser -l qss-user -c 'echo "prefix = ${HOME}/.npm/node_modules" >> ~/.npmrc'
runuser -l qss-user -c 'echo "export PATH=/home/qss-user/.npm/node_modules/bin:\$PATH" >> ~/.bashrc'

# install and initialize pnpm
echo -e "Installing and initializing pnpm\n"
runuser -l qss-user -c 'npm install -g pnpm@10.6.0'
runuser -l qss-user -c 'pnpm setup'

# pickup shell changes for pnpm
runuser -l qss-user -c 'source ~/.bashrc'

# install pm2
echo -e "Installing pm2\n"
runuser -l qss-user -c 'pnpm add -g pm2@7.0.1'

# ensure pm2 starts on reboot
## NOTE: this runs as root, not qss-user
echo -e "Setting up pm2 startup service\n"
sudo env PATH=$PATH:/usr/bin /home/qss-user/.local/share/pnpm/global/5/.pnpm/pm2@7.0.1/node_modules/pm2/bin/pm2 startup systemd -u qss-user --hp /home/qss-user

## Final Cleanup

echo -e "!! Cleaning up for AMI generation !!\n"

# remove temporary files
echo -e "Clearing temp files\n"
sudo rm -rf /tmp/*
sudo rm -rf /var/tmp/*

# clear bash history
echo -e "Clearing bash history\n"
cat /dev/null > ~/.bash_history
history -c

# remove existing ssh keys (rebuilt for each ec2 instance)
echo -e "Clearing ssh keys\n"
sudo rm -f /etc/ssh/ssh_host_*

# clear logs
echo -e "Clearing logs\n"
sudo find /var/log -type f -exec truncate -s 0 {} \;

# clean cloud-init to allow fresh initialization
echo -e "Clearing cloud-init\n"
sudo cloud-init clean --logs --seed

# clean package manager cache
echo -e "Clearing package manager cache\n"
sudo yum clean all

echo -e "Server init finished!"
