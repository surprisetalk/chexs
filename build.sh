#!/bin/sh

set -e

mkdir -p dist
for f_ in src/* ; do
  f=`basename $f_`
  if [[ $f == *.html ]] ; then
    printf "`cat src/template.html`" "`cat src/$f`" > dist/$f
  else
    cp src/$f dist/$f
  fi
done
