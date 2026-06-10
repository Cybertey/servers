const axios = require('axios');
const crypto = require('crypto');

const SALT_KEY = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
const MERCHANT_ID = 'PGTESTPAYUAT';
const PAY_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay';

async function testUniversal() {
    const payload = {
        merchantId: MERCHANT_ID,
        merchantTransactionId: 'TXN_' + Date.now(),
        merchantUserId: 'USER123',
        amount: 10000,
        redirectUrl: 'http://localhost:5173/payment-callback',
        redirectMode: 'REDIRECT',
        callbackUrl: 'http://localhost:5173/payment-callback',
        mobileNumber: '9999999999',
        paymentInstrument: { type: 'PAY_PAGE' }
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    
    for (let index of [1, 2, 3]) {
        const stringToHash = payloadBase64 + '/pg/v1/pay' + SALT_KEY;
        const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const checksum = sha256 + '###' + index;

        try {
            const res = await axios.post(PAY_URL, { request: payloadBase64 }, {
                headers: {
                    'accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-VERIFY': checksum
                }
            });
            console.log(`SUCCESS with index ${index}`);
            return;
        } catch (e) {
            console.log(`FAILED with index ${index}:`, e.response?.data?.code || e.message);
        }
    }
}
testUniversal();
