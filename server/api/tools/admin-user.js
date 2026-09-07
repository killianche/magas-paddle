#!/usr/bin/env node
/**
 * Заводит сотрудника или меняет ему пароль прямо на сервере.
 * Нужен для первого владельца и на случай, если пароль потеряли:
 * через саму админку тогда не войти.
 *
 * Запускать на сервере, из каталога /opt/magas-padel:
 *   docker compose exec -T api node tools/admin-user.js owner <логин> "<Имя>"
 *   docker compose exec -T api node tools/admin-user.js password <логин>
 *
 * Пароль генерируется здесь же и печатается один раз — в базе только хэш.
 */
const { PrismaClient } = require('@prisma/client');
const { randomBytes, scrypt } = require('crypto');
const { promisify } = require('util');
const scryptAsync = promisify(scrypt);

/** Пароль из слов и цифр: его диктуют по телефону, поэтому без похожих знаков. */
function makePassword() {
  const words = ['kort', 'padel', 'magas', 'raketka', 'setka', 'match', 'podacha', 'gejm'];
  const w = () => words[randomBytes(1)[0] % words.length];
  const n = () => String(100 + (randomBytes(2).readUInt16BE(0) % 900));
  return `${w()}-${w()}-${n()}`;
}

async function hash(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

(async () => {
  const [cmd, login, name] = process.argv.slice(2);
  const db = new PrismaClient();
  try {
    if (cmd === 'owner') {
      if (!login || !name) throw new Error('Нужны логин и имя');
      const password = makePassword();
      const password_hash = await hash(password);
      const l = login.trim().toLowerCase();
      await db.admins.upsert({
        where: { login: l },
        update: { name, role: 'owner', password_hash, is_active: true },
        create: { login: l, name, role: 'owner', perms: [], password_hash },
      });
      console.log(`\nВладелец готов.\n  логин:  ${l}\n  пароль: ${password}\n`);
      console.log('Пароль показан один раз — в базе лежит только хэш.\n');
    } else if (cmd === 'password') {
      if (!login) throw new Error('Нужен логин');
      const l = login.trim().toLowerCase();
      const row = await db.admins.findUnique({ where: { login: l } });
      if (!row) throw new Error('Такого логина нет');
      const password = makePassword();
      await db.admins.update({
        where: { login: l }, data: { password_hash: await hash(password) },
      });
      await db.admin_sessions.deleteMany({ where: { admin_id: row.id } });
      console.log(`\nНовый пароль для ${l}: ${password}\n`);
      console.log('Все прежние входы этого сотрудника закрыты.\n');
    } else {
      console.log('Команды: owner <логин> "<Имя>" | password <логин>');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('Ошибка:', e.message);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
})();
