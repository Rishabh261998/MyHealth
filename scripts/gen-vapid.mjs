#!/usr/bin/env node
/* Prints a fresh VAPID key pair for web push. Run: npm run gen:vapid */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Add these to your environment variables (Vercel: Project → Settings → Environment Variables):

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:you@example.com

Keep the private key secret. If you change these keys, every device has to
re-enable notifications.
`);
