#!/bin/bash
echo Are you using the right config? If not, change it now!
sleep 5
yarn
NODE_ENV=production yarn build
cd dist
rm .gitkeep
mkdir graphs
mkdir graphs/trend
mkdir goals
cp app.html settings.html
cp app.html cntpings.html
cp app.html welcome.html
cp app.html graphs.html
cp app.html graphs/day-dist.html
cp app.html graphs/pings-scatter.html
cp app.html graphs/trend/daily.html
cp app.html graphs/trend/weekly.html
cp app.html graphs/trend/monthly.html
cp app.html graphs/correlation
cp app.html goals.html
cp app.html goals/info.html
cp app.html goals/new.html
# While index.html does serve 404s, the reason this is used instead of a static
# page is just in case it turns out I missed a page.
cp app.html 404.html
cp -r ../media .
surge ./ --domain ttw.smitop.com # change to desired front end domain
cd ..
