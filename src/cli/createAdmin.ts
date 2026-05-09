import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { initSchema } from '../db/init.js';
import {
  createAdmin,
  destroyAllSessionsForUser,
  findAdminByUsername,
  setPassword,
} from '../services/auth.js';

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  initSchema();
  const argv = process.argv.slice(2);
  const argMap = new Map<string, string>();
  let resetFlag = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--username' || a === '-u') argMap.set('username', argv[++i] ?? '');
    else if (a === '--password' || a === '-p') argMap.set('password', argv[++i] ?? '');
    else if (a === '--reset' || a === '-r') resetFlag = true;
  }
  const username =
    argMap.get('username') ?? process.env.ADMIN_USERNAME ?? (await prompt('Admin username: '));
  const password =
    argMap.get('password') ?? process.env.ADMIN_PASSWORD ?? (await prompt('Admin password: '));

  if (!username || password.length < 8) {
    console.error('Username required and password must be at least 8 characters.');
    process.exit(1);
  }

  const existing = await findAdminByUsername(username);
  if (existing) {
    if (!resetFlag) {
      console.error(
        `Admin user '${username}' already exists. Pass --reset to overwrite the password (this will sign all sessions out).`,
      );
      process.exit(2);
    }
    await setPassword(existing.id, password);
    await destroyAllSessionsForUser(existing.id);
    console.log(`Reset password for admin#${existing.id} (${existing.username}). All sessions invalidated.`);
    return;
  }

  const user = await createAdmin(username, password);
  console.log(`Created admin user #${user.id} (${user.username}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
