const axios = require('axios');
const crypto = require('crypto');

const SALT_KEY = 'NGVlY2I0NzktZDUwMy00MmE3LTliYTYtNDIzNWQzOTNlNmMz';
const SALT_INDEX = '1';

async function testCombination(merchantId, payUrl) {
    const payload = {
        merchantId: merchantId,
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
    const stringToHash = payloadBase64 + '/pg/v1/pay' + SALT_KEY;
    const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const checksum = sha256 + '###' + SALT_INDEX;

    try {
        console.log(`Testing ${merchantId} with ${payUrl}...`);
        const res = await axios.post(payUrl, { request: payloadBase64 }, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': checksum
            }
        });
        console.log("SUCCESS");
        return true;
    } catch (e) {
        console.log("FAILED:", e.response?.data?.code || e.message);
        return false;
    }
}

async function runTests() {
    const ids = ['M22LO1YAMRBZQ_2606061118', 'M22LO1YAMRBZQ'];
    const urls = [
        'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay',
        'https://api-preprod.phonepe.com/apis/hermes/pg/v1/pay'
    ];

    for (let id of ids) {
        for (let url of urls) {
            await testCombination(id, url);
        }
    }
}
runTests();
