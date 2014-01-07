#!/bin/sh

appname=winmaildat

cp buildscript/makexpi.sh ./
./makexpi.sh -n $appname -o
rm ./makexpi.sh

