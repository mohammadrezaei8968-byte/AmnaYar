#!/bin/sh
set -e
rm -rf gateway/public
mkdir -p gateway/public
cp -R web/. gateway/public/
cd gateway
npm install
