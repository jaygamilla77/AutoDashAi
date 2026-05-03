'use strict';

const nodemailer = require('nodemailer');

let transporter = null;
let mode = 'console'; // 'console' or 'smtp'

function init() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && port && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true' || Number(port) === 465,
      auth: { user, pass },
    });
    mode = 'smtp';
    console.log('[Email] SMTP transport configured: ' + host + ':' + port);
  } else {
    mode = 'console';
    console.log('[Email] SMTP not configured — verification links will be logged to console.');
  }
}

async function sendVerificationEmail({ to, name, verifyUrl }) {
  if (!transporter && mode !== 'console') init();
  const subject = 'Verify your AutoDash AI account';
  const text =
    'Hi ' + (name || '') + ',\n\n' +
    'Please verify your email address to finish creating your AutoDash AI account.\n\n' +
    'Click the link below (valid for 24 hours):\n' + verifyUrl + '\n\n' +
    'If you did not request this, you can ignore this message.\n';
  const html =
    '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0f172a;">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">' +
        '<div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">A</div>' +
        '<strong style="font-size:18px;">AutoDash AI</strong>' +
      '</div>' +
      '<h1 style="font-size:22px;margin:0 0 12px;">Verify your email</h1>' +
      '<p style="color:#475569;line-height:1.55;">Hi ' + (name || 'there') + ', thanks for signing up. Please confirm your email address to finish creating your account.</p>' +
      '<p style="margin:24px 0;">' +
        '<a href="' + verifyUrl + '" style="display:inline-block;padding:12px 22px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;border-radius:999px;font-weight:600;">Verify email</a>' +
      '</p>' +
      '<p style="color:#64748b;font-size:13px;">Or copy this link into your browser:<br><a href="' + verifyUrl + '" style="color:#6366f1;word-break:break-all;">' + verifyUrl + '</a></p>' +
      '<p style="color:#94a3b8;font-size:12px;margin-top:32px;">This link expires in 24 hours. If you did not request this, you can ignore this email.</p>' +
    '</div>';

  if (mode === 'smtp') {
    const from = process.env.SMTP_FROM || ('AutoDash AI <' + process.env.SMTP_USER + '>');
    try {
      const info = await transporter.sendMail({ from, to, subject, text, html });
      return { mode: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.error('[Email] SMTP send failed:', err.code || '', err.message);
      console.log('[Email] Falling back to console log for this message.');
      console.log('  Verify URL: ' + verifyUrl);
      return { mode: 'console', verifyUrl, smtpError: err.message };
    }
  }
  // dev fallback
  console.log('\n──────────────────────────────────────────────');
  console.log('[Email DEV] Verification email for ' + to);
  console.log('  Subject: ' + subject);
  console.log('  Verify URL: ' + verifyUrl);
  console.log('──────────────────────────────────────────────\n');
  return { mode: 'console', verifyUrl };
}

/**
 * Send a sales / enterprise-contact notification to SALES_EMAIL.
 * Falls back to console log when SMTP is not configured.
 */
async function sendSalesContact({ name, email, company, employees, message, source }) {
  if (!transporter && mode !== 'console') init();
  const to = process.env.SALES_EMAIL || process.env.SMTP_USER || '';
  const subject = '[AutoDash AI] Enterprise enquiry — ' + (company || name || email);
  const safe = (s) => String(s == null ? '' : s).replace(/[<>]/g, '');
  const text =
    'New Enterprise / Sales enquiry\n\n' +
    'Name:      ' + safe(name) + '\n' +
    'Email:     ' + safe(email) + '\n' +
    'Company:   ' + safe(company || '—') + '\n' +
    'Employees: ' + safe(employees || '—') + '\n' +
    'Source:    ' + safe(source || 'pricing-page') + '\n\n' +
    'Message:\n' + safe(message || '—') + '\n';
  const html =
    '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;color:#0f172a">' +
      '<h2 style="color:#1e40af;margin:0 0 12px">New Enterprise enquiry</h2>' +
      '<table style="border-collapse:collapse;width:100%;font-size:14px">' +
        '<tr><td style="padding:6px 0;color:#64748b;width:120px">Name</td><td style="padding:6px 0"><strong>' + safe(name) + '</strong></td></tr>' +
        '<tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0"><a href="mailto:' + safe(email) + '">' + safe(email) + '</a></td></tr>' +
        '<tr><td style="padding:6px 0;color:#64748b">Company</td><td style="padding:6px 0">' + safe(company || '—') + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#64748b">Employees</td><td style="padding:6px 0">' + safe(employees || '—') + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#64748b">Source</td><td style="padding:6px 0">' + safe(source || 'pricing-page') + '</td></tr>' +
      '</table>' +
      '<h3 style="margin:20px 0 8px;font-size:14px;color:#475569;text-transform:uppercase;letter-spacing:0.5px">Message</h3>' +
      '<div style="padding:12px 14px;background:#f8fafc;border-left:3px solid #6366f1;border-radius:6px;white-space:pre-wrap;font-size:14px;color:#1e293b">' + safe(message || '—') + '</div>' +
    '</div>';

  if (!to) {
    console.log('\n──────────────────────────────────────────────');
    console.log('[Sales DEV] No SALES_EMAIL/SMTP_USER configured. Logging enquiry instead:');
    console.log(text);
    console.log('──────────────────────────────────────────────\n');
    return { mode: 'console' };
  }

  if (mode === 'smtp') {
    const from = process.env.SMTP_FROM || ('AutoDash AI <' + process.env.SMTP_USER + '>');
    try {
      const info = await transporter.sendMail({ from, to, replyTo: email, subject, text, html });
      return { mode: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.error('[Sales] SMTP send failed:', err.code || '', err.message);
      return { mode: 'console', smtpError: err.message };
    }
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('[Sales DEV] ' + subject);
  console.log(text);
  console.log('──────────────────────────────────────────────\n');
  return { mode: 'console' };
}

init();

module.exports = { sendVerificationEmail, sendSalesContact };
