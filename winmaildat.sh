#!/bin/sh

appname=${0##*/}
appname=${appname%.sh}

cp buildscript/makexpi.sh ./
./makexpi.sh $appname version=1
rm ./makexpi.sh

