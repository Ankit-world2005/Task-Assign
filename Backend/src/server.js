import { createApp } from './app.js';
import { config } from './config.js';
import { describeDatabase, openDatabase } from './db/index.js';
import { createMailer } from './email.js';

const db = await openDatabase(config.database);
const app = createApp({ db, mailer: createMailer(config.email), debug: config.debug, security: config.security });

const server = app.listen(config.port, config.host, async () => {
  console.log(`US24 API (Node.js + Express) running at http://${config.host}:${config.port}/api/`);
  console.log(`Database: ${describeDatabase(config.database)}`);
  console.log(
    config.email.smtpEnabled
      ? `Email: SMTP via ${config.email.host}:${config.email.port}`
      : 'Email: no SMTP credentials set - OTP emails are printed in this window',
  );
  if (config.security.showOtpOnScreen) {
    console.log('WARNING: SHOW_OTP_ON_SCREEN is on - login codes are shown on the login page. Turn it off for real use.');
  }
  if (!(await db.get('SELECT 1 AS found FROM auth_user LIMIT 1'))) {
    console.log('No users in the database yet. Run "npm run seed" to create the demo accounts.');
  }
});

function shutdown() {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
