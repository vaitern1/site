<?php
/*
  Request handler for LEADS.mode = "php" (config.js).
  Secrets (CRM and Telegram tokens) stay here on the server and are never visible to visitors.

  Enable the channels you need — several at once is fine:
    TELEGRAM  — message to a chat or group via your bot
    EMAIL     — email via PHP mail() (your host must allow sending mail)
    BITRIX24  — lead in Bitrix24 via inbound webhook
    WEBHOOK   — JSON to any URL (Make, Zapier, n8n, your own CRM)
    CSV       — backup copy of every request (keep the file outside the web root)
*/

const EMAIL_TO      = '';                         // e.g. hello@yourdomain.com; empty = no email
const EMAIL_FROM    = 'no-reply@data-verification.com';      // an address on your own domain
const BITRIX24_HOOK = '';                           // https://YOUR-DOMAIN.bitrix24.com/rest/1/CODE/
const WEBHOOK_URL   = '';                           // https://hook.eu1.make.com/...
const TELEGRAM_BOT  = '8438358322:AAGZ7Ee60y_WT5sNOVPDAebjFBzBvFPxA1A'; // bot token from @BotFather — keep it only here, never in config.js
const TELEGRAM_CHAT = '-1003852428895';             // group «Заявки по данным»
const CSV_PATH      = __DIR__ . '/../leads.csv';    // '' = don't save
const ALLOWED_ORIGIN = '';                          // optional exact origin; same-site check below works on any domain

header('Content-Type: application/json; charset=utf-8');

function reply(int $code, array $body): void { http_response_code($code); echo json_encode($body, JSON_UNESCAPED_UNICODE); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['ok' => false, 'error' => 'method not allowed']);
// accept requests only from this same website (works on any domain without configuration)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
  $oh = strtolower((string)parse_url($origin, PHP_URL_HOST));
  $sh = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
  if ($oh !== $sh && preg_replace('/^www\./', '', $oh) !== preg_replace('/^www\./', '', $sh)) reply(403, ['ok' => false, 'error' => 'forbidden']);
}
if (ALLOWED_ORIGIN && $origin !== ALLOWED_ORIGIN) reply(403, ['ok' => false, 'error' => 'forbidden']);

$raw = file_get_contents('php://input');
$d = json_decode($raw, true);
if (!is_array($d)) $d = $_POST;
if (!empty($d['website'])) reply(200, ['ok' => true]);                       // honeypot for bots

$fields = ['name','contact','company','message','service','estimate','details','lead_id','utm_source','utm_medium',
           'utm_campaign','utm_content','utm_term','gclid','yclid','fbclid','referrer','landing_page','consent','page','submitted_at'];
$lead = [];
foreach ($fields as $f) { $lead[$f] = trim(mb_substr(strip_tags((string)($d[$f] ?? '')), 0, 3000)); }
if ($lead['name'] === '' || $lead['contact'] === '') reply(422, ['ok' => false, 'error' => 'Please fill in your name and contact']);
if ($lead['consent'] !== 'yes') reply(422, ['ok' => false, 'error' => 'Privacy Policy consent is required']);
$lead['ip'] = $_SERVER['REMOTE_ADDR'] ?? '';
$lead['received_at'] = gmdate('c');

// simple rate limit: one request per 20 seconds per IP
$rl = sys_get_temp_dir() . '/sd_rl_' . md5($lead['ip']);
if (is_file($rl) && time() - filemtime($rl) < 20) reply(429, ['ok' => false, 'error' => 'Too many requests, please try again in a minute']);
@touch($rl);

$text = "New request from the DataQA website\n\n"
      . "Name: {$lead['name']}\nContact: {$lead['contact']}\nCompany/website: {$lead['company']}\n"
      . "Service: {$lead['service']} ({$lead['estimate']})\nDetails: {$lead['details']}\nMessage: {$lead['message']}\n\n"
      . "Source: {$lead['utm_source']} / {$lead['utm_medium']} / {$lead['utm_campaign']}\n"
      . "Click ID: " . ($lead['gclid'] ?: ($lead['yclid'] ?: $lead['fbclid'])) . "\nReferrer: {$lead['referrer']}\n"
      . "Landing page: {$lead['landing_page']}\nLead ID: {$lead['lead_id']}";

function post_json(string $url, array $body): bool {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE)]);
  curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  return $code >= 200 && $code < 300;
}

$delivered = []; $failed = [];

if (EMAIL_TO) {
  $headers = "From: " . EMAIL_FROM . "\r\nContent-Type: text/plain; charset=utf-8\r\n";
  if (filter_var($lead['contact'], FILTER_VALIDATE_EMAIL)) $headers .= "Reply-To: {$lead['contact']}\r\n";
  $subject = '=?UTF-8?B?' . base64_encode('New request: ' . $lead['service']) . '?=';
  (mail(EMAIL_TO, $subject, $text, $headers) ? $delivered[] = 'email' : $failed[] = 'email');
}
if (BITRIX24_HOOK) {
  $f = ['TITLE' => 'Website request: ' . $lead['service'], 'NAME' => $lead['name'], 'COMPANY_TITLE' => $lead['company'],
        'COMMENTS' => nl2br(htmlspecialchars($text)), 'SOURCE_ID' => 'WEB', 'SOURCE_DESCRIPTION' => $lead['lead_id'],
        'UTM_SOURCE' => $lead['utm_source'], 'UTM_MEDIUM' => $lead['utm_medium'], 'UTM_CAMPAIGN' => $lead['utm_campaign'],
        'UTM_CONTENT' => $lead['utm_content'], 'UTM_TERM' => $lead['utm_term']];
  if (filter_var($lead['contact'], FILTER_VALIDATE_EMAIL)) $f['EMAIL'] = [['VALUE' => $lead['contact'], 'VALUE_TYPE' => 'WORK']];
  elseif (preg_match('/^\+?[\d\s()-]{7,}$/', $lead['contact'])) $f['PHONE'] = [['VALUE' => $lead['contact'], 'VALUE_TYPE' => 'WORK']];
  else $f['IM'] = [['VALUE' => ltrim($lead['contact'], '@'), 'VALUE_TYPE' => 'TELEGRAM']];
  (post_json(rtrim(BITRIX24_HOOK, '/') . '/crm.lead.add.json', ['fields' => $f]) ? $delivered[] = 'bitrix24' : $failed[] = 'bitrix24');
}
if (WEBHOOK_URL) { (post_json(WEBHOOK_URL, $lead) ? $delivered[] = 'webhook' : $failed[] = 'webhook'); }
if (TELEGRAM_BOT && TELEGRAM_CHAT) {
  (post_json("https://api.telegram.org/bot" . TELEGRAM_BOT . "/sendMessage", ['chat_id' => TELEGRAM_CHAT, 'text' => $text])
    ? $delivered[] = 'telegram' : $failed[] = 'telegram');
}
if (CSV_PATH) {
  $new = !is_file(CSV_PATH);
  if ($fh = @fopen(CSV_PATH, 'a')) {
    if ($new) fputcsv($fh, array_keys($lead));
    fputcsv($fh, array_values($lead)); fclose($fh); $delivered[] = 'csv';
  } else { $failed[] = 'csv'; }
}

if (!$delivered) reply(502, ['ok' => false, 'error' => 'Request could not be delivered: ' . implode(', ', $failed ?: ['no channels enabled'])]);
reply(200, ['ok' => true, 'lead_id' => $lead['lead_id'], 'delivered' => $delivered]);
