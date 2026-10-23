#!/bin/sh
# Сменить домен сайта во всех файлах:  ./set-domain.sh data-verification.io
# (сейчас стоит data-verification.com)
set -e
NEW="$1"
[ -z "$NEW" ] && { echo "Укажите домен, например: ./set-domain.sh data-verification.io"; exit 1; }
OLD=$(grep -o 'https://[^/"]*' sitemap.xml | head -1 | sed 's#https://##')
for f in index.html privacy.html robots.txt sitemap.xml llms.txt .well-known/security.txt config.js; do
  [ -f "$f" ] && sed -i.bak "s#$OLD#$NEW#g" "$f" && rm -f "$f.bak"
done
echo "Домен заменён: $OLD → $NEW"
