#!/bin/sh
set -e
apt-get update
apt-get install -y ghostscript
rm -rf gateway/public
mkdir -p gateway/public
cp -R web/. gateway/public/
cd gateway
npm install
