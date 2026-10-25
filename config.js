/*
  Site settings. Edit here — no need to touch the page code.

  WHERE REQUESTS GO — choose one option in LEADS.mode:

  "php"       — your own server: send.php (next to index.html) delivers to Telegram, email, CRM, any webhook and a CSV backup.
                Tokens live on the server and are never visible in the browser. Recommended.
  "formspree" — email via formspree.io: create a form and paste its endpoint.
  "web3forms" — email via web3forms.com: paste your access key.
  "hubspot"   — straight into HubSpot (Forms API): portalId and formGuid of a HubSpot form.
  "bitrix24"  — straight into Bitrix24 (inbound webhook with CRM scope). The webhook URL is visible in page source — prefer "php".
  "webhook"   — any endpoint that accepts JSON: Make, Zapier, n8n, your own CRM.
  "mailto"    — no server at all: opens the visitor's email client with a prefilled message (fallback).
*/
window.SITE_CONFIG = {
  LEADS: {
    mode: "webhook",   // static hosting (GitHub Pages etc.): leads go through telegram-worker.js

    php:       { url: "send.php" },
    formspree: { url: "https://formspree.io/f/YOUR_ID" },
    web3forms: { accessKey: "YOUR_ACCESS_KEY" },
    hubspot:   { portalId: "YOUR_PORTAL_ID", formGuid: "YOUR_FORM_GUID" },
    bitrix24:  { webhook: "https://YOUR-DOMAIN.bitrix24.com/rest/1/YOUR_CODE/" },
    webhook:   { url: "https://YOUR-WORKER.YOUR-ACCOUNT.workers.dev", headers: {} },   // address of your Cloudflare Worker
    mailto:    { email: "hello@data-verification.com" }
  },

  // Contacts shown in the footer and in error messages
  CONTACT_EMAIL: "hello@data-verification.com",
  CONTACT_TELEGRAM: "example",          // without @

  // Prices (USD). The audit calculator stays within these bounds.
  PRICES: {
    auditMin: 100,
    auditMax: 600,
    reportMonthly: 20,
    projectMonthly: 150
  }
};
