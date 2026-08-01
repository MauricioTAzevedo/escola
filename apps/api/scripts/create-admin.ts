import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const prisma = new PrismaClient();

const PASSWORD_MIN_LENGTH = 12;

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_BOOTSTRAP_ALLOWED) {
    console.error('🛑 Refusing to bootstrap an admin in production.');
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });

  const email = (await rl.question('Admin e-mail: ')).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('E-mail inválido.');
    process.exit(1);
  }

  const name = (await rl.question('Admin name: ')).trim() || 'Administrador';

  let password = '';
  while (true) {
    password = await rl.question(`Password (min ${PASSWORD_MIN_LENGTH} chars, letter+digit): `);
    if (password.length < PASSWORD_MIN_LENGTH) {
      console.error(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      continue;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      console.error('A senha deve conter letras e números.');
      continue;
    }
    break;
  }

  rl.close();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === 'ADMIN') {
      console.error('Já existe um administrador com este e-mail.');
      process.exit(1);
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN' },
    });
    console.log(`✅ Usuário ${email} promovido a ADMIN.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, name, passwordHash, role: 'ADMIN' },
  });
  console.log(`✅ Administrador ${email} criado com sucesso.`);
}

main()
  .catch((err) => {
    console.error('Erro ao criar administrador:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
