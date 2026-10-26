# FABIYAN JadiBot Backend

Backend awal Node.js/Express untuk deploy di Railway.

## Deploy
1. Ekstrak ZIP.
2. Unggah file di dalam folder ke repository GitHub baru.
3. Railway: New Project → Deploy from GitHub Repo.
4. Tambahkan Variables: `JWT_SECRET` (acak, minimal 32 karakter), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (minimal 12 karakter), `DATA_DIR=/data`.
5. Tambahkan Railway Volume dengan mount path `/data`.
6. Generate domain dari Settings/Networking.
7. Tes `https://DOMAIN/health`, hasil yang diharapkan: `{"ok":true,"service":"fabiyan-jadibot-api"}`.

## Endpoint
- `GET /health`
- `POST /api/auth/register` JSON: `{"email":"user@example.com","password":"password-panjang"}`
- `POST /api/auth/login` JSON: `{"email":"user@example.com","password":"password-panjang"}`
- `GET /api/me` dengan header `Authorization: Bearer TOKEN`
- `GET /api/dashboard` dengan token
- `GET /api/bots` dengan token
- `POST /api/bots` JSON: `{"name":"Bot 1","phone":"62812xxxxxxx"}` dengan token
- `DELETE /api/bots/ID` dengan token

PENTING: pairing/QR WhatsApp asli, sesi WhatsApp, pembayaran, frontend dashboard, dan status online real belum diintegrasikan. Ini adalah backend dasar, bukan salinan penuh sistem Udun.
Railway Free memiliki batas penggunaan/kredit; jangan menganggapnya sebagai hosting gratis 24/7 tanpa batas.
