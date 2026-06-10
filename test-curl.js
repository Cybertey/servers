const crypto = require('crypto');
const axios = require('axios');

const payload = {
  "merchantId": "PGTESTPAYUAT",
  "merchantTransactionId": "MT7850590068188104",
  "merchantUserId": "MUID123",
  "amount": 10000,
  "redirectUrl": "https://webhook.site/redirect-url",
  "redirectMode": "REDIRECT",
  "callbackUrl": "https://webhook.site/callback-url",
  "mobileNumber": "9999999999",
  "paymentInstrument": {
    "type": "PAY_PAGE"
  }
};

const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
const saltIndex = 1;

const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
const sign = base64 + "/pg/v1/pay" + saltKey;
const expectedChecksum = crypto.createHash('sha256').update(sign).digest('hex') + "###" + saltIndex;

axios.post('https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay', { request: base64 }, {
    headers: { 'Content-Type': 'application/json', 'X-VERIFY': expectedChecksum }
}).then(r => console.log("SUCCESS:", r.data)).catch(e => console.log("FAIL:", e.response?.data));
