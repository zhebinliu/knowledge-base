#!/bin/sh
set -eu

for cert_name in kb.sharewb.cloud skillhub.sharewb.cloud aihub.sharewb.cloud; do
  docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    -v /var/www/certbot:/var/www/certbot \
    certbot/certbot:latest \
    renew --quiet --cert-name "$cert_name"
done

docker exec kb-system-edge-1 nginx -s reload
