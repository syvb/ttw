const webPush = require("web-push");
const keys = webPush.generateVAPIDKeys();
console.log(
`    "vapid-public": "${keys.publicKey}",
    "vapid-private": "${keys.privateKey}",`)
