const express = require('express');
const app = express();
const grpc = require('grpc');
const fs = require("fs");

// Due to updated ECDSA generated tls.cert we need to let gprc know that
// we need to use that cipher suite otherwise there will be a handhsake
// error when we communicate with the lnd rpc server.
process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA'

app.get('/', function (req, res) {
  //  Lnd cert is at ~/.lnd/tls.cert on Linux and
  //  ~/Library/Application Support/Lnd/tls.cert on Mac
  const lndCert = fs.readFileSync("tls.cert");
  const credentials = grpc.credentials.createSsl(lndCert);
  const lnrpcDescriptor = grpc.load("rpc.proto");
  const lnrpc = lnrpcDescriptor.lnrpc;
  const lightning = new lnrpc.Lightning('34.208.184.134:10009', credentials);
  lightning.getInfo({}, function(err, response) {
    if (err) console.log(err)
    console.log('GetInfo:', response);
  });
  res.send('Hello world!');
});
app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
