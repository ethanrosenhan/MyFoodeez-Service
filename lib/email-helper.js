import fetch from 'node-fetch';
import { getOptionalEnv } from '../utils/env.js';

// Transactional email via Resend's REST API (no SDK dependency — just
// node-fetch). One place to send mail so signup, password reset, and support
// all behave consistently. When RESEND_API_KEY is unset we no-op (matches the
// old "skip in dev" behavior) so the service still runs without email wired up.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const isEmailConfigured = () => Boolean(getOptionalEnv('RESEND_API_KEY'));

// Send one email. `to` may be a string or array. Returns the Resend response
// (with the message id) on success, or { skipped: true } when not configured.
// Throws on an API error so callers can decide whether to surface it.
const sendEmail = async ({ from, to, subject, text, html }) => {
    const apiKey = getOptionalEnv('RESEND_API_KEY');
    if (!apiKey) {
        return { skipped: true };
    }
    if (!from || !to || !subject) {
        throw new Error('sendEmail requires from, to, and subject');
    }

    const recipients = Array.isArray(to) ? to : [to];
    const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: recipients, subject, text, html })
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Resend send failed (${response.status}): ${detail}`);
    }
    return response.json().catch(() => ({}));
};

export { isEmailConfigured, sendEmail };
