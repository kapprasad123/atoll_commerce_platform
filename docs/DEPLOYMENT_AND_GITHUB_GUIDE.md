# GitHub & Production Deployment Instructions

## 1. Connecting to a GitHub Repository
1. Initialize Git in the extracted project folder:
   ```bash
   cd atoll_commerce_platform
   git init
   git branch -M main
   ```
2. Verify that `.env` is ignored by checking `.gitignore`:
   ```bash
   git status
   ```
3. Commit and push to your GitHub repository:
   ```bash
   git add .
   git commit -m "feat: initial release of AtollHub Multi-Shop E-Commerce, POS & Inventory Platform"
   git remote add origin https://github.com/<your-org>/<your-repo>.git
   git push -u origin main
   ```

## 2. Production Deployment with Docker Compose
1. Copy `.env.example` to `.env` on your production server (Ubuntu 22.04 LTS / Debian 12 recommended) and set strong secrets:
   ```bash
   cp .env.example .env
   openssl rand -hex 64 # Use output for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
   ```
2. Build and launch the stack:
   ```bash
   docker compose up -d --build
   ```
3. Run initial Master Admin setup:
   ```bash
   docker exec -it atollhub_backend npm run setup:admin
   ```

## 3. External Integrations Requiring Optional Credentials
- **WhatsApp Click-to-Chat (`wa.me`) & Viber Sharing (`viber://`)**: Work immediately out-of-the-box with zero API keys required.
- **Optional Meta WhatsApp Business Cloud API**: To send automated server-side WhatsApp push messages without user interaction, set `WHATSAPP_CLOUD_API_ENABLED=true`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_ACCESS_TOKEN` in `.env`.
- **Optional Live Exchange Rate Sync**: Manual exchange rate updates work out-of-the-box. For automated daily rate sync, set `EXCHANGE_RATE_API_PROVIDER=exchangerate-api` and `EXCHANGE_RATE_API_KEY` in `.env`.
- **Optional S3 Object Storage**: Local image upload works out-of-the-box (`STORAGE_DRIVER=local`). For AWS S3 / Cloudflare R2 / DigitalOcean Spaces, set `STORAGE_DRIVER=s3` and populate `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
