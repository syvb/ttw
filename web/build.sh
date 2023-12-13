#!/usr/bin/env bash
echo Generating license disclaimer
yarn licenses generate-disclaimer --silent --prod > static/disclaimer.txt

echo Templating pages
sed "s/APPNAME/$(node -e "console.log(require('../config.json')['app-name'] || 'TagTime Web')")/g" static/manifest.webmanifest.template > static/manifest.webmanifest
sed "s/APPNAME/$(node -e "console.log(require('../config.json')['app-name'] || 'TagTime Web')")/g" static/index.html.template | sed "s*BACKSERV*$(node -e "console.log(require('../config.json')['api-server'])")*g" | sed "s*EXTRA_TEXT*$(node -e "let c = require('../config.json');console.log(c['extra-homepage-text']);if(c.enableSimpleAnalytics)console.log('<script async defer src="https://scripts.simpleanalyticscdn.com/latest.js"></script>')")*g" > static/index.html

echo Compiling taglogic
rm -rf dist pkg
wasm-pack build ../taglogic/ --out-dir ../web/pkg
