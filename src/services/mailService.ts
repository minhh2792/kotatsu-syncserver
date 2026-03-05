export interface MailSender {
  send(options: {
    to: string;
    subject: string;
    textBody: string;
    htmlBody?: string;
  }): Promise<void>;
}

export class ConsoleMailSender implements MailSender {
  async send(options: { to: string; subject: string; textBody: string; htmlBody?: string }): Promise<void> {
    console.log("=== ConsoleMail ===");
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Body (plain):\n${options.textBody}`);
    console.log("==================");
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
}

export class SmtpMailSender implements MailSender {
  constructor(private readonly config: SmtpConfig) {}

  async send(options: { to: string; subject: string; textBody: string; htmlBody?: string }): Promise<void> {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.port === 465,
      auth: {
        user: this.config.username,
        pass: this.config.password,
      },
    });

    const mailOptions: Parameters<typeof transporter.sendMail>[0] = {
      from: this.config.from,
      to: options.to,
      subject: options.subject,
      text: options.textBody,
    };

    if (options.htmlBody) {
      mailOptions.html = options.htmlBody;
    }

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${options.to}`);
    } catch (err) {
      console.error(`Failed to send email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

let mailService: MailSender;

export function getMailService(): MailSender {
  if (!mailService) {
    throw new Error("Mail service not initialized");
  }
  return mailService;
}

export function initMailService(provider: string, smtpConfig?: SmtpConfig): void {
  if (provider === "smtp") {
    if (!smtpConfig) {
      throw new Error("SMTP config is required when mail_provider is smtp");
    }
    mailService = new SmtpMailSender(smtpConfig);
  } else {
    mailService = new ConsoleMailSender();
  }
}
