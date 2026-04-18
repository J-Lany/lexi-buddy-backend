import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export const RESEND_CLIENT = Symbol('RESEND_CLIENT');

const ACTIVATION_SUBJECT = 'Activate your Lexi Buddy account';
const DEFAULT_LOGO_URL =
  'https://edfc0c93-c754-494d-9f9c-76185dc39b2d.selstorage.ru/icon.png';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly from: string;
  private readonly activationBaseUrl: string;
  private readonly logoUrl: string;

  constructor(
    @Inject(RESEND_CLIENT) private readonly resend: Resend,
    private readonly configService: ConfigService,
  ) {
    this.from = this.configService.getOrThrow<string>('MAIL_FROM');
    this.activationBaseUrl =
      this.configService.getOrThrow<string>('ACTIVATION_URL');
    this.logoUrl =
      this.configService.get<string>('MAIL_LOGO_URL') ?? DEFAULT_LOGO_URL;
  }

  async sendActivationMail(email: string, token: string): Promise<void> {
    const activationUrl = this.buildActivationUrl(token);

    try {
      const response = await this.resend.emails.send({
        from: this.from,
        to: email,
        subject: ACTIVATION_SUBJECT,
        html: this.buildActivationHtml(activationUrl),
        text: this.buildActivationText(activationUrl),
        attachments: [
          {
            path: this.logoUrl,
            filename: 'lexi-buddy-icon.png',
            contentId: 'lexi-logo',
          },
        ],
      });

      if (response.error) {
        this.logger.error(
          `Failed to send activation email. recipient=${this.maskEmail(email)} providerError=${this.stringifyProviderError(response.error)}`,
        );
        throw new InternalServerErrorException(
          'Failed to send activation email',
        );
      }

      this.logger.log(
        `Activation email sent. recipient=${this.maskEmail(email)} emailId=${response.data?.id ?? 'unknown'}`,
      );
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown unexpected error';

      this.logger.error(
        `Unexpected error while sending activation email. recipient=${this.maskEmail(email)} error=${message}`,
      );

      throw new InternalServerErrorException('Failed to send activation email');
    }
  }

  private buildActivationUrl(token: string): string {
    const url = new URL(this.activationBaseUrl);
    url.searchParams.set('token', token);

    return url.toString();
  }

  private buildActivationHtml(activationUrl: string): string {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <img
          src="cid:lexi-logo"
          alt="Lexi Buddy"
          width="72"
          height="72"
          style="display:block; border-radius:16px; margin-bottom:16px;"
        />

        <h2 style="margin: 0 0 12px;">Welcome to Lexi Buddy</h2>

        <p style="margin: 0 0 16px;">
          Click the button below to activate your account.
        </p>

        <p style="margin: 24px 0;">
          <a
            href="${activationUrl}"
            style="
              background:#111827;
              color:#ffffff;
              text-decoration:none;
              padding:12px 18px;
              border-radius:10px;
              display:inline-block;
            "
          >
            Activate account
          </a>
        </p>

        <p style="margin: 0; color:#6b7280; font-size:14px;">
          If the button does not work, use this link:
        </p>

        <p style="margin: 8px 0 0; font-size:14px;">
          <a href="${activationUrl}">${activationUrl}</a>
        </p>
      </div>
    `;
  }

  private buildActivationText(activationUrl: string): string {
    return [
      'Welcome to Lexi Buddy.',
      'Activate your account using the link below:',
      activationUrl,
    ].join('\n');
  }

  private maskEmail(email: string): string {
    const [localPart = '', domainPart = ''] = email.split('@');

    const visiblePart = localPart.slice(0, 2);
    const hiddenLength = Math.max(localPart.length - visiblePart.length, 1);

    return `${visiblePart}${'*'.repeat(hiddenLength)}@${domainPart}`;
  }

  private stringifyProviderError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unable to serialize provider error';
    }
  }
}
