# LifeStorage

LifeStorage opens the protected account and Journal storage screens on its own domain. It uses the existing Neon Auth account and Journal backend. Sign in with the same account if the browser does not carry the existing session to LifeStorage.

To transfer browser-only data, download a backup from Hub, sign in to LifeStorage, and select the backup before enabling cloud sync on this device. Restore requires confirmation and leaves the source Hub data and backup file in place.

Use npm ci, npm test and npm run build to verify the project. Configure production credentials in Vercel, never in the repository. DATABASE_URL is server-only.
