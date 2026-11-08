import nodemailer from 'nodemailer';

/**
 * SMTP sender when credentials are configured; otherwise prints messages to the console,
 * so OTP codes show up in the server window.
 */
export function createMailer(emailConfig, write = (text) => process.stdout.write(text)) {
  const transport = emailConfig.smtpEnabled
    ? nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: false,
        requireTLS: emailConfig.useTls,
        ignoreTLS: !emailConfig.useTls,
        auth: { user: emailConfig.user, pass: emailConfig.password },
      })
    : null;

  return {
    async send({ to, subject, text, html }) {
      if (transport) {
        await transport.sendMail({ from: emailConfig.from, to, subject, text, html });
        return;
      }
      write(
        `Subject: ${subject}\nFrom: ${emailConfig.from}\nTo: ${to}\nDate: ${new Date().toUTCString()}\n\n${text}\n` +
          `${'-'.repeat(79)}\n`,
      );
    },
  };
}
