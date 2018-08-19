const express = require('express');
const app = express();
const grpc = require('grpc');
const fs = require("fs");
const async = require('async');
const _ = require('lodash');
const ByteBuffer = require('bytebuffer');

// Due to updated ECDSA generated tls.cert we need to let gprc know that
// we need to use that cipher suite otherwise there will be a handhsake
// error when we communicate with the lnd rpc server.
process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA'

/**
 * Set up the connection to the LND node using the admin macaroon credentials.
 * @return {lnrpc.Lightning} The LND client to use
 */
const getClient = function (ip, port) {
  // Lnd admin macaroon is at ~/.lnd/admin.macaroon on Linux and
  // ~/Library/Application Support/Lnd/admin.macaroon on Mac
  const m = fs.readFileSync('admin.macaroon');
  const macaroon = m.toString('hex');

  // build meta data credentials
  var metadata = new grpc.Metadata()
  metadata.add('macaroon', macaroon)
  var macaroonCreds = grpc.credentials.createFromMetadataGenerator((_args, callback) => {
    callback(null, metadata);
  });

  // build ssl credentials using the cert the same as before
  var lndCert = fs.readFileSync("tls.cert");
  var sslCreds = grpc.credentials.createSsl(lndCert);

  // combine the cert credentials and the macaroon auth credentials
  // such that every call is properly encrypted and authenticated
  var credentials = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

  // Pass the crendentials when creating a channel
  var lnrpcDescriptor = grpc.load("rpc.proto");
  var lnrpc = lnrpcDescriptor.lnrpc;
  return new lnrpc.Lightning(ip + ':' + port, credentials);
}

/**
 * Set up the events for the Payment call
 * @param client The connection to the LND node to use
 * @return The payment call with the proper events handlers
 */
const getPaymentCall = function (client) {
  // Set a listener on the bidirectional stream
  const call = client.sendPayment();
  call.on('data', function(payment) {
    console.log("Payment notice:");
    console.log(payment);
  });
  call.on('error', function(err) {
    console.log("Error:" + err.details);
    console.log(err);
  });
  call.on('end', function() {
    // The server has finished
    console.log("END");
  });
  return call;
}

/**
 * Subscribe to LND to receive notifications about invoices.
 * @param ip
 * @param port
 * @param callback To handle the server response, can be an invoice, error or status JSON
 */
exports.subscribeToInvoices = function (ip, port, callback) {
  const client = getClient(ip, port);
  const call = client.subscribeInvoices({});
  call.on('data', function(invoice) {
    console.log("Invoice notice:");
    console.log(invoice);
    callback(invoice);
  })
    .on('error', function(err) {
      console.log("Invoice error:" + err.details);
      console.log(err);
      callback(err);
    })
    .on('end', function() {
      // The server has finished sending
      console.log("Invoice END");
    })
    .on('status', function(status) {
      // Process status
      console.log("Invoice current status" + status);
      callback(status);
    });
}

/**
 * Get LND server info like the identity pubkey
 * @param callback Function to apply to the response
 */
exports.getInfo = function (ip, port, callback) {
  const client = getClient(ip, port);

  client.getInfo({}, (err, response) => {
    if (err) console.log(err)
    console.log('GetInfo:', response);
    callback(response);
  });
}

/**
 * Sends a payment to the LND node
 * @param amount
 */
exports.sendPayment = function (ip, port, amount) {
  const client = getClient(ip, port);

  client.getInfo({}, (err, response) => {
    if (err) console.log(err)
    console.log('GetInfo:', response);
    const call = getPaymentCall(client);
    const destination = response.identity_pubkey;
    const dest_pubkey_bytes = ByteBuffer.fromHex(destination);
    console.log("Sending " + amount + " satoshis");
    console.log("To: " + destination);
    call.write({
      dest: dest_pubkey_bytes,
      amt: amount
    });
  });
}

/**
 * Creates a new invoice
 * @param ip
 * @param port
 * @param amount to be paid in satoshies
 * @param memo Invoice description
 * @param callback to run on the server response
 */
exports.generateInvoice = function (ip, port, amount, memo, callback) {
  const client = getClient(ip, port);
  var request = {
    memo: memo,
    value: amount
  };

  client.addInvoice(request, function(err, response) {
    console.log(response);
    callback(response);
  });
}

/**
 * Experimental, send the same amount of Satoshis every 2 seconds.
 * @param amount
 */
exports.sendMultiplePayments = function (ip, port, amount) {
  const client = getClient(ip, port);
  client.getInfo({}, (err, response) => {
    function paymentSender(destination, amount) {
      return function(callback) {
        console.log("Sending " + amount + " satoshis");
        console.log("To: " + destination);
        call.write({
          dest: destination,
          amt: amount
        });
        _.delay(callback, 2000);
      };
    }
    const call = getPaymentCall(client);
    const dest_pubkey_bytes = response.identity_pubkey;
    let payment_senders = [];
    for (var i = 0; i < 10; i++) {
      payment_senders[i] = paymentSender(dest_pubkey_bytes, amount);
    }
    async.series(payment_senders, function() {
      call.end();
    });
  });
}
