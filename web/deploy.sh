echo Are you using the right config? If not, change it now!
yarn
NODE_ENV=production yarn build
cd dist
rm .gitkeep
mkdir graphs
mkdir graphs/trend
mkdir goals
cp index.html app.html
cp index.html settings.html
cp index.html cntpings.html
cp index.html welcome.html
cp index.html graphs.html
cp index.html graphs/day-dist.html
cp index.html graphs/pings-scatter.html
cp index.html graphs/trend/daily.html
cp index.html graphs/trend/weekly.html
cp index.html graphs/trend/monthly.html
cp index.html goals.html
cp index.html goals/info.html
cp index.html goals/new.html
# While index.html does serve 404s, the reason this is used instead of a static
# page is just in case it turns out I missed a page.
cp index.html 404.html
cp -r ../media .
surge ./ --domain ttw.smitop.com # change to desired front end domain
cd ..
