# dubitjs

# Setup
To use this library you must add to the project root foler the following files:
* admin.macaroon
* tls.cert

# Examples

```
bitreader.subscribeToInvoices('127.0.0.1', 10009, function (invoice) {
  if (invoice.payment_request) {
    console.log('Invoice received! ' + invoice.payment_request)
  } else {
    console.log('Something went wrong. LND response: ' + invoice)
  }
});
```
