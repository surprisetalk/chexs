#!/bin/sh

set -e

mkdir -p dist

ls src

for f_ in src/* ; do
  f=`basename $f_`
  if [[ $f == *.html ]] ; then
    echo
    echo "===" "src/template.html" "src/$f"
    printf "`cat src/template.html`" "`cat src/$f`"
    printf "`cat src/template.html`" "`cat src/$f`" > dist/$f
  else
    cp src/$f dist/$f
  fi
done

ls dist
