#!/bin/sh
set -e
sh gateway/build.sh
rm -rf public
cp -R web public
npm install
