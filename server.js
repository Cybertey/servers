require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Path to local config file (stored alongside server.js)
const CONFIG_FILE = path.join(__dirname, 'phonepe-config.json');

// Read config from local JSON file, fallback to .env
const getPhonePeConfig = () => {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
            const config = JSON.parse(raw);
            if (config.merchantId && config.saltKey && config.apiUrl) {
                return config;
            }
        }
    } catch (err) {
        console.warn('Could not read config file, using .env fallback:', err.message);
    }
    
    // Support both naming conventions
    // Vercel: CLIENT_ID, CLIENT_SECRET, CLIENT_VERSION
    // Or: PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, PHONEPE_SALT_INDEX
    const merchantId = process.env.PHONEPE_CLIENT_ID || process.env.PHONEPE_MERCHANT_ID;
    const saltKey = process.env.PHONEPE_CLIENT_SECRET || process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_CLIENT_VERSION || process.env.PHONEPE_SALT_INDEX || '1';
    
    return {
        merchantId: merchantId,
        saltKey: saltKey,
        saltIndex: saltIndex,
        apiUrl: process.env.PHONEPE_PAY_URL,
        frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    };
};

// Admin endpoint to update PhonePe config (called from Admin Panel)
app.post('/api/update-config', (req, res) => {
    try {
        const { merchantId, saltKey, saltIndex, apiUrl, frontendUrl, adminSecret } = req.body;

        // Basic security: require a secret token
        const expectedSecret = process.env.ADMIN_SECRET || 'cybertey-admin-2026';
        if (adminSecret !== expectedSecret) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (!merchantId || !saltKey || !apiUrl) {
            return res.status(400).json({ success: false, message: 'merchantId, saltKey, and apiUrl are required' });
        }

        const config = { merchantId, saltKey, saltIndex: saltIndex || '1', apiUrl, frontendUrl: frontendUrl || 'http://localhost:5173' };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
        console.log('✅ PhonePe config updated via Admin Panel');
        return res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (err) {
        console.error('Error saving config:', err.message);
        res.status(500).json({ success: false, message: 'Failed to save configuration' });
    }
});

// Get current config status (for admin panel to check)
app.get('/api/config-status', (req, res) => {
    try {
        const config = getPhonePeConfig();
        return res.json({
            success: true,
            configured: !!(config.merchantId && config.saltKey && config.apiUrl),
            merchantId: config.merchantId ? config.merchantId.substring(0, 8) + '****' : null,
            mode: config.apiUrl?.includes('preprod') ? 'test' : 'live',
            source: fs.existsSync(CONFIG_FILE) ? 'admin-panel' : '.env',
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Test connection endpoint
app.post('/api/test-connection', async (req, res) => {
    try {
        const { merchantId, saltKey, saltIndex, apiUrl } = req.body;

        if (!merchantId || !saltKey || !apiUrl) {
            return res.status(400).json({ success: false, message: 'merchantId, saltKey and apiUrl are required' });
        }

        const payload = {
            merchantId,
            merchantTransactionId: `TXN_TEST_${Date.now()}`,
            merchantUserId: 'TESTUSER123',
            amount: 100,
            redirectUrl: 'https://example.com/callback',
            redirectMode: 'REDIRECT',
            callbackUrl: 'https://example.com/callback',
            mobileNumber: '9999999999',
            paymentInstrument: { type: 'PAY_PAGE' }
        };

        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
        const stringToHash = payloadBase64 + '/pg/v1/pay' + saltKey;
        const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const checksum = sha256 + '###' + (saltIndex || '1');

        const response = await axios.post(apiUrl, { request: payloadBase64 }, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': checksum
            }
        });

        if (response.data && response.data.success) {
            return res.json({ success: true, message: 'Connection successful' });
        } else {
            return res.json({ success: false, message: response.data.message || 'Credentials invalid' });
        }
    } catch (error) {
        if (error.response) {
            return res.json({ success: false, message: error.response.data?.message || 'API Error', code: error.response.data?.code });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// Main payment endpoint
app.post('/api/pay', async (req, res) => {
    try {
        const { amount, transactionId, userId, mobileNumber, callbackParam } = req.body;

        const { merchantId, saltKey, saltIndex, apiUrl, frontendUrl } = getPhonePeConfig();

        if (!merchantId || !saltKey || !apiUrl) {
            return res.status(500).json({
                success: false,
                message: 'PhonePe credentials not configured. Please set them in Admin → 💳 PhonePe Gateway.'
            });
        }

        const cleanAmount = parseInt(amount) || 100;
        const safeUserId = (userId || 'USER123').replace(/[^a-zA-Z0-9]/g, '');
        const safeTxnId = (transactionId || `TXN_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');

        const payload = {
            merchantId,
            merchantTransactionId: safeTxnId,
            merchantUserId: safeUserId,
            amount: cleanAmount * 100,
            redirectUrl: `${frontendUrl}/payment-callback?txnId=${safeTxnId}&param=${callbackParam || ''}`,
            redirectMode: 'REDIRECT',
            callbackUrl: `${frontendUrl}/payment-callback`,
            mobileNumber: (mobileNumber || '9999999999').replace(/[^0-9]/g, '').substring(0, 10),
            paymentInstrument: { type: 'PAY_PAGE' }
        };

        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
        const stringToHash = payloadBase64 + '/pg/v1/pay' + saltKey;
        const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const checksum = sha256 + '###' + saltIndex;

        const response = await axios.post(apiUrl, { request: payloadBase64 }, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': checksum
            }
        });

        if (response.data && response.data.success) {
            const redirectUrl = response.data.data.instrumentResponse.redirectInfo.url;
            return res.json({ success: true, redirectUrl });
        } else {
            console.error('PhonePe API Error:', response.data);
            return res.status(400).json({ success: false, message: response.data.message || 'Payment initiation failed' });
        }
    } catch (error) {
        console.error('PhonePe API call failed:', error.message);
        if (error.response) console.error('PhonePe response data:', error.response.data);
        res.status(500).json({ success: false, message: 'Server error during payment initiation' });
    }
});

// Status check endpoint
app.post('/api/status', async (req, res) => {
    try {
        const { transactionId } = req.body;
        const { merchantId, saltKey, saltIndex, apiUrl } = getPhonePeConfig();

        const endpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
        const stringToHash = endpoint + saltKey;
        const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const checksum = sha256 + '###' + saltIndex;
        const STATUS_URL = apiUrl.replace('/pay', `/status/${merchantId}/${transactionId}`);

        const response = await axios.get(STATUS_URL, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': checksum,
                'X-MERCHANT-ID': merchantId
            }
        });

        return res.json({ success: true, data: response.data.data });
    } catch (error) {
        console.error('Status Check Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to check status' });
    }
});

app.listen(PORT, () => {
    const config = getPhonePeConfig();
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`💳 PhonePe config source: ${fs.existsSync(CONFIG_FILE) ? 'Admin Panel (phonepe-config.json)' : '.env file'}`);
    console.log(`🔑 Merchant ID: ${config.merchantId || 'NOT SET'}`);
});
