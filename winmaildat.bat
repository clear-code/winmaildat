set appname=winmaildat

copy buildscript\makexpi.sh .\
bash makexpi.sh -n %appname% -o
del makexpi.sh
