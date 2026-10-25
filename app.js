/* DataQA — page behavior: reconciliation animation, service picker, estimate calculator, request form. */
(function () {
  "use strict";
  var CFG = window.SITE_CONFIG || {};
  var PRICES = Object.assign({ auditMin: 100, auditMax: 600, reportMonthly: 20, projectMonthly: 150 }, CFG.PRICES || {});
  window.dataLayer = window.dataLayer || [];
  function track(event, params) { window.dataLayer.push(Object.assign({ event: event }, params || {})); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- contacts from config ---------- */
  if (CFG.CONTACT_EMAIL) { var m = $("#foot-mail"); m.href = "mailto:" + CFG.CONTACT_EMAIL; m.textContent = CFG.CONTACT_EMAIL; }
  if (CFG.CONTACT_TELEGRAM) { $("#foot-tg").href = "https://t.me/" + CFG.CONTACT_TELEGRAM; }

  /* ---------- visitor source: UTM and click IDs (first touch is remembered) ---------- */
  var ATTR_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "yclid", "fbclid"];
  var attribution = (function () {
    var q = new URLSearchParams(location.search), now = {}, hasNew = false;
    ATTR_KEYS.forEach(function (k) { if (q.get(k)) { now[k] = q.get(k); hasNew = true; } });
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem("sd_attribution") || "null"); } catch (e) { stored = null; }
    if (!stored || hasNew) {
      stored = Object.assign({ referrer: document.referrer || "", landing_page: location.href }, now);
      try { localStorage.setItem("sd_attribution", JSON.stringify(stored)); } catch (e) { /* storage unavailable */ }
    }
    return stored;
  })();

  function newLeadId() { return "L-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }

  /* ---------- hero: rows are reconciled one by one ---------- */
  var rows = $$(".ledger__row:not(.ledger__row--h)");
  function runLedger() {
    rows.forEach(function (r) { r.classList.remove("is-checked"); });
    $("#meter").style.width = "0";
    $("#found").textContent = "0%";
    var found = rows.filter(function (r) { return r.dataset.state !== "miss"; }).length;
    var pct = Math.round(found / rows.length * 100);
    function finish() { $("#meter").style.width = pct + "%"; $("#found").textContent = pct + "%"; }
    if (reduced) { rows.forEach(function (r) { r.classList.add("is-checked"); }); finish(); return; }
    rows.forEach(function (r, i) { setTimeout(function () { r.classList.add("is-checked"); if (i === rows.length - 1) setTimeout(finish, 250); }, 450 + i * 380); });
  }
  runLedger();
  $("#replay").addEventListener("click", runLedger);

  /* ---------- service picker ---------- */
  var state = { service: "audit", estimate: "", details: "", value: 0 };
  var tabs = $$(".pick");
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
    state.service = tab.dataset.service;
    track("service_select", { service: state.service });
    recalc();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t); });
    t.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });

  /* ---------- estimate calculator ---------- */
  var VOLUME_ADD = [0, 60, 140, 260];
  var VOLUME_TEXT = ["up to 100K rows", "up to 1M rows", "up to 10M rows", "over 10M rows"];
  var TOOL_ADD = 40;
  function money(v) { return "$" + v.toLocaleString("en-US"); }
  function plural(n, one, many) { return n === 1 ? one : many; }

  function calcAudit() {
    var v = +($("input[name=volume]:checked") || { value: 0 }).value;
    var tools = $$("#tools input:checked").map(function (i) { return i.value; });
    var price = PRICES.auditMin + VOLUME_ADD[v] + Math.max(0, tools.length - 1) * TOOL_ADD;
    price = Math.min(PRICES.auditMax, Math.max(PRICES.auditMin, Math.round(price / 10) * 10));
    $("#audit-price").textContent = money(price);
    $("#audit-hint").textContent = tools.length < 2
      ? "Reconciliation needs at least two systems — for example, CRM and GA4."
      : "We'll reconcile " + tools.length + " " + plural(tools.length, "system", "systems") + " against each other. Exact price confirmed once we've seen the data.";
    return { price: price, details: "Volume: " + VOLUME_TEXT[v] + ". Systems: " + (tools.join(", ") || "none selected") };
  }

  function calcSub() {
    var plan = ($("input[name=plan]:checked") || { value: "reports" }).value;
    var input = $("#reports");
    var n = Math.min(50, Math.max(1, parseInt(input.value, 10) || 1));
    input.value = n;
    $("#reports-field").hidden = plan !== "reports";
    var price = plan === "project" ? PRICES.projectMonthly : n * PRICES.reportMonthly;
    $("#sub-price").textContent = money(price);
    if (plan === "project") {
      $("#sub-hint").textContent = "Every system, warehouse layer, dashboard and on-site tracker — no limit on reports.";
    } else if (price >= PRICES.projectMonthly) {
      $("#sub-hint").textContent = "At this many reports the whole project is cheaper — " + money(PRICES.projectMonthly) + " per month.";
    } else {
      $("#sub-hint").textContent = "Each report or dashboard is checked against its source data.";
    }
    return { price: price, details: plan === "project" ? "Whole project" : n + " " + plural(n, "report or dashboard", "reports or dashboards") + " × " + money(PRICES.reportMonthly) };
  }

  function recalc(fromUser) {
    var r;
    if (state.service === "audit") { r = calcAudit(); state.estimate = "estimated " + money(r.price); }
    else if (state.service === "subscription") { r = calcSub(); state.estimate = money(r.price) + " per month"; }
    else { r = { price: 0, details: $("#custom-text").value.trim() }; state.estimate = "to be discussed"; }
    state.value = r.price; state.details = r.details;
    if (fromUser) track("calculator_change", { service: state.service, price: r.price });
    renderChoice();
  }
  var NAMES = { audit: "Data audit", subscription: "Ongoing monitoring", custom: "Something else" };
  function renderChoice() {
    $("#choice-text").textContent = NAMES[state.service] + (state.service === "custom" ? "" : ", " + state.estimate);
  }

  $$("#volume input, #tools input, #plan input").forEach(function (i) { i.addEventListener("change", function () { recalc(true); }); });
  $("#reports").addEventListener("input", function () { recalc(true); });
  $$(".stepper__btn").forEach(function (b) {
    b.addEventListener("click", function () { var i = $("#reports"); i.value = (parseInt(i.value, 10) || 1) + +b.dataset.step; recalc(true); });
  });
  $("#custom-text").addEventListener("input", function () { recalc(false); });

  $$("[data-apply]").forEach(function (b) {
    b.addEventListener("click", function () {
      recalc(false);
      var msg = $("#f-message");
      if (state.service === "custom" && state.details && !msg.value.trim()) msg.value = state.details;
      $("#lead").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
      setTimeout(function () { $("#f-name").focus({ preventScroll: true }); }, reduced ? 0 : 500);
    });
  });
  recalc(false);

  /* ---------- request form ---------- */
  var form = $("#lead-form"), statusEl = $("#status"), submitBtn = $("#submit");
  var started = false;
  form.addEventListener("input", function () { if (!started) { started = true; track("form_start", { service: state.service }); } });

  function fillHidden(leadId) {
    form.service.value = NAMES[state.service];
    form.estimate.value = state.estimate;
    form.details.value = state.details;
    form.lead_id.value = leadId;
    ATTR_KEYS.concat(["referrer", "landing_page"]).forEach(function (k) { if (form[k]) form[k].value = attribution[k] || ""; });
  }

  function validate() {
    var ok = true;
    ["name", "contact"].forEach(function (n) {
      var el = form[n], bad = !el.value.trim();
      el.classList.toggle("is-invalid", bad); if (bad) ok = false;
    });
    var c = form.contact.value.trim();
    if (c && !/@|^\+?[\d\s()-]{7,}$|^@?[A-Za-z0-9_]{4,}$/.test(c)) { form.contact.classList.add("is-invalid"); ok = false; }
    var consent = form.consent.checked;
    form.consent.closest(".check").classList.toggle("is-invalid", !consent);
    if (!consent) ok = false;
    return ok;
  }

  function payload() {
    var data = {};
    new FormData(form).forEach(function (v, k) { if (k !== "website") data[k] = v; });
    data.consent = form.consent.checked ? "yes" : "no";
    data.page = location.href;
    data.submitted_at = new Date().toISOString();
    return data;
  }

  function textBody(d) {
    return [
      "New request from the DataQA website", "",
      "Name: " + d.name, "Contact: " + d.contact, "Company/website: " + (d.company || "—"),
      "Service: " + d.service + (d.estimate ? " (" + d.estimate + ")" : ""), "Estimate details: " + (d.details || "—"),
      "Message: " + (d.message || "—"), "",
      "Source: " + (d.utm_source || "—") + " / " + (d.utm_medium || "—") + " / " + (d.utm_campaign || "—"),
      "Click ID: " + (d.gclid || d.yclid || d.fbclid || "—"), "Referrer: " + (d.referrer || "—"),
      "Landing page: " + (d.landing_page || "—"), "Lead ID: " + d.lead_id
    ].join("\n");
  }

  function postJSON(url, body, headers) {
    return fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "Accept": "application/json" }, headers || {}), body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error("server responded " + r.status); return r.text(); })
      .then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) { /* not JSON — that's fine */ }
        if (j && (j.ok === false || j.success === false || j.error)) throw new Error(j.message || j.error || "request was not processed"); return j; });
  }

  var SENDERS = {
    php: function (d, c) { return postJSON(c.url, d); },
    formspree: function (d, c) { return postJSON(c.url, Object.assign({ _subject: "New request: " + d.service }, d)); },
    web3forms: function (d, c) { return postJSON("https://api.web3forms.com/submit", Object.assign({ access_key: c.accessKey, subject: "New request: " + d.service, from_name: "DataQA website" }, d)); },
    webhook: function (d, c) { return postJSON(c.url, d, c.headers); },
    hubspot: function (d, c) {
      var isEmail = d.contact.indexOf("@") > 0 && d.contact.indexOf("@") < d.contact.length - 1 && d.contact[0] !== "@";
      var fields = [{ name: "firstname", value: d.name }, { name: isEmail ? "email" : "phone", value: d.contact },
                    { name: "company", value: d.company || "" }, { name: "message", value: textBody(d) }];
      return postJSON("https://api.hsforms.com/submissions/v3/integration/submit/" + c.portalId + "/" + c.formGuid,
                      { fields: fields, context: { pageUri: location.href, pageName: document.title } });
    },
    bitrix24: function (d, c) {
      var isEmail = /@.+\./.test(d.contact) && d.contact[0] !== "@";
      var isPhone = /^\+?[\d\s()-]{7,}$/.test(d.contact);
      var f = { TITLE: "Website request: " + d.service, NAME: d.name, COMPANY_TITLE: d.company || "", COMMENTS: textBody(d).replace(/\n/g, "<br>"),
                SOURCE_ID: "WEB", SOURCE_DESCRIPTION: d.lead_id, OPPORTUNITY: state.value || "", CURRENCY_ID: "USD",
                UTM_SOURCE: d.utm_source, UTM_MEDIUM: d.utm_medium, UTM_CAMPAIGN: d.utm_campaign, UTM_CONTENT: d.utm_content, UTM_TERM: d.utm_term };
      if (isEmail) f.EMAIL = [{ VALUE: d.contact, VALUE_TYPE: "WORK" }];
      else if (isPhone) f.PHONE = [{ VALUE: d.contact, VALUE_TYPE: "WORK" }];
      else f.IM = [{ VALUE: d.contact.replace(/^@/, ""), VALUE_TYPE: "TELEGRAM" }];
      return postJSON(c.webhook.replace(/\/?$/, "/") + "crm.lead.add.json", { fields: f, params: { REGISTER_SONET_EVENT: "Y" } });
    },
    mailto: function (d, c) {
      location.href = "mailto:" + c.email + "?subject=" + encodeURIComponent("New request: " + d.service) + "&body=" + encodeURIComponent(textBody(d));
      return Promise.resolve();
    }
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    statusEl.className = "form__status"; statusEl.textContent = "";
    if (form.website.value) return;                       // a bot filled the hidden field
    if (!validate()) { statusEl.className = "form__status err"; statusEl.textContent = "Please fill in your name and contact and accept the Privacy Policy."; return; }
    var leadId = newLeadId();
    fillHidden(leadId);
    var leads = CFG.LEADS || { mode: "mailto", mailto: { email: CFG.CONTACT_EMAIL } };
    var sender = SENDERS[leads.mode];
    if (!sender) { statusEl.className = "form__status err"; statusEl.textContent = "Delivery mode \"" + leads.mode + "\" is not configured in config.js."; return; }
    var data = payload();
    submitBtn.disabled = true; submitBtn.textContent = "Sending…";
    sender(data, leads[leads.mode] || {}).then(function () {
      track("generate_lead", { lead_id: leadId, service: state.service, value: state.value, currency: "USD" });
      statusEl.className = "form__status ok";
      statusEl.textContent = "Request sent. We'll get back to you at the contact you provided.";
      form.reset(); started = false;
    }).catch(function (err) {
      statusEl.className = "form__status err";
      statusEl.textContent = "Couldn't send your request (" + err.message + "). Please email us at " + (CFG.CONTACT_EMAIL || "our address") + " or try again.";
    }).then(function () { submitBtn.disabled = false; submitBtn.textContent = "Send request"; });
  });
})();
