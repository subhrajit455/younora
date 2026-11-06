const nodemailer = require('nodemailer');
const { env } = require('../../config/env');
const logger = require('../logger');

class Mailer {
  constructor() {
    this.sentEmails = []; // Recorded only in test mode for assertions

    if (env.NODE_ENV === 'test') {
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    } else {
      const options = {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
      };

      if (env.SMTP_USER && env.SMTP_PASS) {
        options.auth = {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        };
      }

      this.transporter = nodemailer.createTransport(options);
    }
  }

  /**
   * Generic send email wrapper
   */
  async sendMail({ to, subject, html, text }) {
    try {
      const mailOptions = {
        from: env.EMAIL_FROM,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>?/gm, ''),
      };

      const info = await this.transporter.sendMail(mailOptions);

      // In test environment, record message for assertions without logging sensitive data
      if (env.NODE_ENV === 'test') {
        this.sentEmails.push({
          to,
          subject,
          messageId: info.messageId,
          content: JSON.parse(info.message || '{}'),
        });
      }

      logger.info({
        to,
        subject,
        messageId: info.messageId,
        msg: 'Transactional email sent successfully',
      });

      return info;
    } catch (error) {
      logger.error({
        err: error,
        to,
        subject,
        msg: 'Failed to send transactional email',
      });
      // Do not crash main thread on email failure in non-critical flows
      return null;
    }
  }

  /**
   * Send Email Verification
   */
  async sendVerificationEmail({ to, name, token }) {
    const verificationUrl = `${env.STOREFRONT_URL}/verify-email?token=${token}`;
    const subject = 'Verify your Younora Luxury Fashion Account';
    const html = `
      <div style="font-family: serif; color: #1A100B; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #D9A441; letter-spacing: 1px;">YOUNORA LUXURY FASHION</h2>
        <p>Dear ${name || 'Customer'},</p>
        <p>Thank you for creating an account with Younora. Please verify your email address to activate your account features:</p>
        <p style="margin: 24px 0;">
          <a href="${verificationUrl}" style="background-color: #D9A441; color: #0B0705; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">Verify Email</a>
        </p>
        <p>This verification link will expire in 24 hours.</p>
        <p style="font-size: 12px; color: #6B5A4B;">If you did not create this account, please ignore this email.</p>
      </div>
    `;

    return this.sendMail({ to, subject, html });
  }

  /**
   * Send Password Reset Link
   */
  async sendPasswordResetEmail({ to, name, token }) {
    const resetUrl = `${env.STOREFRONT_URL}/reset-password?token=${token}`;
    const subject = 'Reset your Younora Password';
    const html = `
      <div style="font-family: serif; color: #1A100B; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #D9A441; letter-spacing: 1px;">YOUNORA LUXURY FASHION</h2>
        <p>Dear ${name || 'Customer'},</p>
        <p>We received a request to reset your password. Click the link below to choose a new password:</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #D9A441; color: #0B0705; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">Reset Password</a>
        </p>
        <p>This link is valid for 1 hour. If you did not request a password reset, your account remains secure and no action is needed.</p>
      </div>
    `;

    return this.sendMail({ to, subject, html });
  }

  /**
   * Helper to inspect sent emails in unit/integration tests
   */
  getSentEmails() {
    return this.sentEmails;
  }

  clearSentEmails() {
    this.sentEmails = [];
  }
}

const mailer = new Mailer();

module.exports = mailer;

