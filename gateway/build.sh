#!/bin/sh
set -e
rm -rf public
cp -R ../web public
npm install