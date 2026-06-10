const crypto = require('crypto');
const axios = require('axios');

const payload = {
  "merchantId": "PGTESTPAYUAT86",
  "merchantTransactionId": "MT7850590068188104",
  "merchantUserId": "MUID123",
  "amount": 10000,
  "redirectUrl": "https://webhook.site/redirect-url",
  "redirectMode": "REDIRECT",
  "callbackUrl": "https://webhook.site/callback-url",
  "mobileNumber": "9999999999",
  "paymentInstrument": { "type": "PAY_PAGE" }
};

const saltKey = '96434309-7796-489d-8924-ab56988a6076';
const saltIndex = 1;

const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
const sign = base64 + "/pg/v1/pay" + saltKey;
const expectedChecksum = crypto.createHash('sha256').update(sign).digest('hex') + "###" + saltIndex;

axios.post('https://api-preprod.phonepe.com/apis/hermes/pg/v1/pay', { request: base64 }, {
    headers: { 'Content-Type': 'application/json', 'X-VERIFY': expectedChecksum }
}).then(r => console.log("SUCCESS:", r.data)).catch(e => console.log("FAIL:", e.response?.data));
