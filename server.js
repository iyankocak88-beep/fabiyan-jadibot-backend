import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_FILE = path.join(DATA_DIR, 'database.json');
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET to a random secret of at least 32 characters.');
  process.exit(1);
}

app.use(helmet());
app.use(express.json({ limit: '20kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 120 }));

let db = { users: [], bots: [] };
await fs.mkdir(DATA_DIR, { recursive: true });
try {
  db = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
} catch {
  await saveDb();
}
async function saveDb() {
  const tmp = DB_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  await fs.rename(tmp, DB_FILE);
}
function safeUser(u) {
  return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt };
}
function tokenFor(u) {
  return jwt.sign({ sub: u.id, role: u.role }, JWT_SECRET, {
    expiresIn: '12h', issuer: 'fabiyan-jadibot'
  });
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    if (!h.startsWith('Bearer ')) throw new Error();
    const claims = jwt.verify(h.slice(7), JWT_SECRET, { issuer: 'fabiyan-jadibot' });
    req.user = db.users.find(u => u.id === claims.sub);
    if (!req.user) throw new Error();
    next();
  } catch {
    res.status(401).json({ error: 'Sesi tidak valid atau kedaluwarsa.' });
  }
}
const validEmail = e => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(e) && e.length <= 190;
const emailOf = v => typeof v === 'string' ? v.trim().toLowerCase() : '';

app.get('/', (_req, res) => res.json({
  name: 'FABIYAN JadiBot API',
  status: 'ok',
  note: 'Pairing/QR WhatsApp belum diintegrasikan.'
}));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'fabiyan-jadibot-api' }));

app.post('/api/auth/register', async (req, res) => {
  const email = emailOf(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!validEmail(email)) return res.status(400).json({ error: 'Format email tidak valid.' });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Password harus 10–128 karakter.' });
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: 'Email sudah terdaftar.' });
  const user = {
    id: crypto.randomUUID(), email,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'user', createdAt: new Date().toISOString()
  };
  db.users.push(user);
  await saveDb();
  res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const email = emailOf(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }
  res.json({ token: tokenFor(user), user: safeUser(user) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));
app.get('/api/dashboard', auth, (req, res) => {
  const mine = db.bots.filter(b => b.userId === req.user.id);
  res.json({
    user: safeUser(req.user),
    bots: {
      total: mine.length,
      online: mine.filter(b => b.status === 'online').length,
      offline: mine.filter(b => b.status !== 'online').length
    }
  });
});
app.get('/api/bots', auth, (req, res) => {
  const bots = db.bots.filter(b => b.userId === req.user.id)
    .map(({ id, name, phoneMasked, status, createdAt }) => ({ id, name, phoneMasked, status, createdAt }));
  res.json({ bots });
});
app.post('/api/bots', auth, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 50) : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.replace(/[^\\d+]/g, '') : '';
  if (!name) return res.status(400).json({ error: 'Nama bot wajib diisi.' });
  if (!/^\\+?[1-9]\\d{8,14}$/.test(phone)) return res.status(400).json({ error: 'Gunakan nomor dengan kode negara.' });
  const bot = {
    id: crypto.randomUUID(), userId: req.user.id, name,
    phoneMasked: phone.slice(0, 4) + '••••' + phone.slice(-3),
    status: 'offline', createdAt: new Date().toISOString()
  };
  db.bots.push(bot);
  await saveDb();
  res.status(201).json({
    bot: { id: bot.id, name: bot.name, phoneMasked: bot.phoneMasked, status: bot.status, createdAt: bot.createdAt },
    note: 'Catatan bot dibuat; pairing WhatsApp belum diaktifkan.'
  });
});
app.delete('/api/bots/:id', auth, async (req, res) => {
  const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot tidak ditemukan.' });
  db.bots = db.bots.filter(b => b.id !== bot.id);
  await saveDb();
  res.json({ ok: true });
});

if (ADMIN_EMAIL && ADMIN_PASSWORD.length >= 12 && validEmail(ADMIN_EMAIL) && !db.users.some(u => u.email === ADMIN_EMAIL)) {
  db.users.push({
    id: crypto.randomUUID(), email: ADMIN_EMAIL,
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
    role: 'admin', createdAt: new Date().toISOString()
  });
  await saveDb();
}

app.use((err, _req, res, _next) => {
  console.error(err?.message || err);
  res.status(500).json({ error: 'Terjadi kesalahan server.' });
});
app.listen(PORT, '0.0.0.0', () => console.log(`FABIYAN JadiBot API listening on ${PORT}`));
