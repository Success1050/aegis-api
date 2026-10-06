import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface SendWelcomeCredentialsInput {
  toEmail: string;
  name: string;
  role: string;
  phone: string;
  tempPassword: string;
  zoneName?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || '587', 10);
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (host && user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
          tls: { rejectUnauthorized: false },
        });
        this.logger.log(`📧 SMTP Transporter initialized (${host}:${port})`);
      } catch (err) {
        this.logger.warn(`Failed to initialize SMTP transporter: ${(err as Error).message}`);
        this.transporter = null;
      }
    } else {
      this.logger.log('ℹ️  SMTP not configured. Credentials will be dispatched to terminal logger in dev mode.');
    }
  }

  /**
   * Dispatches welcome email with initial password, login identifier, and website portal link.
   */
  async sendWelcomeCredentials(input: SendWelcomeCredentialsInput): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3000');
    const loginUrl = `${frontendUrl}/login`;
    const from = process.env.FROM_EMAIL || '"AEGIS Early-Warning Alert" <alerts@aegis.ng>';

    const subject = `Welcome to AEGIS — Your Account Credentials (${input.role})`;

    const textContent = `
=====================================================
🛡️ AEGIS COMMUNITY EARLY-WARNING SYSTEM
=====================================================
Hello ${input.name},

You have been successfully registered to the Aegis Early-Warning Network.
Your emergency alert notifications are ACTIVE by default.

YOUR LOGIN CREDENTIALS:
- Portal URL: ${loginUrl}
- Login Email: ${input.toEmail}
- Login Phone: ${input.phone}
- Password:    ${input.tempPassword}
- Role:        ${input.role}
${input.zoneName ? `- Home Zone:   ${input.zoneName}` : ''}

Please log in at ${loginUrl} and change your password.
If an emergency incident occurs in your zone, you will receive immediate SMS alerts.
=====================================================
`;

    const htmlContent = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <div style="background-color: #0f172a; padding: 20px; border-radius: 6px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">🛡️ AEGIS EARLY-WARNING</h1>
    <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 13px;">Community Safety & Incident Alert Network</p>
  </div>

  <div style="padding: 24px 8px; color: #1e293b;">
    <p style="font-size: 16px; margin-top: 0;">Hello <strong>${input.name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.5; color: #475569;">
      You have been registered to the Aegis Early-Warning System as <strong>${input.role}</strong>.
      Emergency alert broadcasts are <strong>active by default</strong> for your registered profile.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 18px; margin: 20px 0;">
      <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #0f172a;">🔐 Your Access Credentials</h3>
      <table style="width: 100%; font-size: 14px; color: #334155;">
        <tr><td style="padding: 4px 0; font-weight: 600; width: 120px;">Login Email:</td><td>${input.toEmail}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: 600;">Login Phone:</td><td>${input.phone}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: 600;">Password:</td><td style="font-family: monospace; font-size: 15px; color: #2563eb;"><strong>${input.tempPassword}</strong></td></tr>
        <tr><td style="padding: 4px 0; font-weight: 600;">Role:</td><td>${input.role}</td></tr>
        ${input.zoneName ? `<tr><td style="padding: 4px 0; font-weight: 600;">Assigned Zone:</td><td>${input.zoneName}</td></tr>` : ''}
      </table>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${loginUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; font-weight: 600; border-radius: 6px; display: inline-block; font-size: 15px;">Log in to Portal</a>
    </div>

    <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
      Website Link: <a href="${loginUrl}" style="color: #2563eb;">${loginUrl}</a><br/>
      If you did not request this registration, please contact your local security council administrator immediately.
    </p>
  </div>
</div>
`;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: input.toEmail,
          subject,
          text: textContent,
          html: htmlContent,
        });
        this.logger.log(`✅ Welcome credentials email sent successfully to ${input.toEmail}`);
        return true;
      } catch (err) {
        this.logger.error(`Failed to send email to ${input.toEmail}: ${(err as Error).message}`);
        // Log fallback terminal output so credentials are never silently lost
        this.logTerminalCredentials(textContent);
        return false;
      }
    } else {
      // In development or when SMTP not connected, print clear terminal output
      this.logTerminalCredentials(textContent);
      return true;
    }
  }

  private logTerminalCredentials(block: string): void {
    console.log('\n================== ONBOARDING CREDENTIAL DISPATCH ==================');
    console.log(block.trim());
    console.log('====================================================================\n');
  }
}
