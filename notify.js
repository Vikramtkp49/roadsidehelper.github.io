// notify.js — SMS via Fast2SMS (Quick route) + WhatsApp via CallMeBot
require('dotenv').config();

const FAST2SMS_KEY    = process.env.FAST2SMS_API_KEY;
const CALLMEBOT_PHONE = process.env.CALLMEBOT_PHONE;
const CALLMEBOT_KEY   = process.env.CALLMEBOT_APIKEY;

// ─── Clean to 10 digits ───────────────────────────────
function to10Digits(phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 10) return digits;
    return digits.slice(-10);
}

// ─── Send SMS via Fast2SMS Quick Route ────────────────
// Route 'q' = Quick SMS
//   - No DLT registration needed
//   - No sender ID needed
//   - Sends to ALL Indian numbers including DND
//   - Custom message text ✅
//   - Cost: ₹5 per SMS
async function sendSMS(toPhone, message) {
    if (!FAST2SMS_KEY) {
        console.warn('⚠️  FAST2SMS_API_KEY missing — SMS skipped.');
        return null;
    }

    const mobile = to10Digits(toPhone);

    // Use GET request exactly as per Fast2SMS docs
    const params = new URLSearchParams({
        authorization: FAST2SMS_KEY,
        route: 'q',           // Quick SMS — no sender_id, no DLT
        message: message,     // plain text message
        language: 'english',
        flash: '0',
        numbers: mobile
    });

    const url = `https://www.fast2sms.com/dev/bulkV2?${params.toString()}`;

    console.log(`📤 Sending SMS to ${mobile}...`);
    console.log(`📝 Message: "${message}"`);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'cache-control': 'no-cache'
            }
        });

        const data = await response.json();
        console.log(`📬 Fast2SMS response:`, JSON.stringify(data, null, 2));

        if (data.return === true) {
            console.log(`✅ SMS sent to ${mobile} | Request ID: ${data.request_id}`);
        } else {
            console.error(`❌ Fast2SMS failed: ${JSON.stringify(data.message)}`);
        }

        return data;
    } catch (err) {
        console.error(`❌ SMS request error:`, err.message);
        return null;
    }
}

// ─── Send WhatsApp via CallMeBot ──────────────────────
async function sendWhatsApp(message) {
    if (!CALLMEBOT_PHONE || !CALLMEBOT_KEY) {
        console.warn('⚠️  CallMeBot config missing — WhatsApp skipped.');
        return null;
    }

    console.log(`📤 Sending WhatsApp to ${CALLMEBOT_PHONE}...`);

    try {
        const encodedMsg = encodeURIComponent(message);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}&text=${encodedMsg}&apikey=${CALLMEBOT_KEY}`;

        const response = await fetch(url);
        const text = await response.text();

        console.log(`📬 CallMeBot response (${response.status}): ${text}`);

        if (response.ok) {
            console.log(`✅ WhatsApp sent via CallMeBot`);
        } else {
            console.error(`❌ CallMeBot error: ${text}`);
        }

        return text;
    } catch (err) {
        console.error(`❌ WhatsApp error:`, err.message);
        return null;
    }
}

// ─── Send both simultaneously ─────────────────────────
async function notify(phone, message) {
    await Promise.allSettled([
        sendSMS(phone, message),
        sendWhatsApp(message)
    ]);
}

// ══════════════════════════════════════════════════════
// MESSAGE TEMPLATES
// ══════════════════════════════════════════════════════

async function notifyCustomerRequestReceived(phone, name, vehicle) {
    const msg = `Roadside Helper: Hi ${name}! Your assistance request for your ${vehicle} has been received. A mechanic will contact you shortly. -Team Roadside Helper`;
    await notify(phone, msg);
}

async function notifyMechanicRegistered(phone, name) {
    const msg = `Roadside Helper: Hi ${name}! Your mechanic registration is received. We will verify your details and notify you once approved (24-48 hrs). -Team Roadside Helper`;
    await notify(phone, msg);
}

async function notifyMechanicApproved(phone, name) {
    const msg = `Roadside Helper: Hi ${name}! Your mechanic profile is APPROVED. You are now live on the platform and can receive service requests. Welcome! -Team Roadside Helper`;
    await notify(phone, msg);
}

async function notifyMechanicRejected(phone, name) {
    const msg = `Roadside Helper: Hi ${name}, your registration was not approved. Reason: incomplete documents or unclear images. Contact support to re-apply. -Team Roadside Helper`;
    await notify(phone, msg);
}

async function notifyCustomerMechanicAssigned(phone, customerName, mechanicName, mechanicPhone) {
    const msg = `Roadside Helper: Hi ${customerName}! Mechanic ${mechanicName} (${mechanicPhone}) has been assigned to your request. Stay safe! -Team Roadside Helper`;
    await notify(phone, msg);
}

module.exports = {
    sendSMS,
    sendWhatsApp,
    notify,
    notifyCustomerRequestReceived,
    notifyMechanicRegistered,
    notifyMechanicApproved,
    notifyMechanicRejected,
    notifyCustomerMechanicAssigned
};