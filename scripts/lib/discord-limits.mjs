/* Discord's limits for a message, its components and a modal, in one place for
   scripts/check-commands.mjs and scripts/simulate-bot.mjs. createChecker() returns a
   checkPayload(where, payload) that records every rule a payload breaks in .problems. */
export function createChecker() {
  const problems = [];
  let checked = 0;
function checkComponents(where, rows, inModal) {
  if (!rows) return;
  if (!Array.isArray(rows) || rows.length > 5) problems.push(where + ": more than 5 component rows");
  for (const r of rows || []) {
    if (r.type !== 1) { problems.push(where + ": a top-level component is not an action row"); continue; }
    const items = r.components || [];
    if (!items.length) problems.push(where + ": an empty action row");
    const selects = items.filter((c) => [3, 5, 6, 7, 8].includes(c.type));
    const inputs = items.filter((c) => c.type === 4);
    if (selects.length && items.length > 1) problems.push(where + ": a select menu must be alone in its row");
    if (inputs.length && items.length > 1) problems.push(where + ": a text input must be alone in its row");
    if (items.length > 5) problems.push(where + ": more than 5 buttons in a row");
    for (const c of items) {
      checked += 1;
      if (c.custom_id !== undefined && (typeof c.custom_id !== "string" || !c.custom_id || c.custom_id.length > 100)) problems.push(where + ": custom_id must be 1-100 characters (" + c.custom_id + ")");
      if (c.type === 2) {
        if (c.style === 5) { if (!c.url) problems.push(where + ": link button without a url"); if (c.custom_id) problems.push(where + ": link button with a custom_id"); }
        else if (!c.custom_id) problems.push(where + ": button without a custom_id");
        if (!c.label && !c.emoji) problems.push(where + ": button without a label");
        if (c.label && c.label.length > 80) problems.push(where + ": button label over 80 characters");
      }
      if (c.type === 3) {
        const o = c.options || [];
        if (!o.length || o.length > 25) problems.push(where + ": a select menu needs 1-25 options (has " + o.length + ")");
        for (const opt of o) {
          if (!opt.label || opt.label.length > 100) problems.push(where + ": select option label must be 1-100 characters");
          if (!opt.value || String(opt.value).length > 100) problems.push(where + ": select option value must be 1-100 characters");
          if (opt.description && opt.description.length > 100) problems.push(where + ": select option description over 100 characters");
        }
        const values = new Set(o.map((x) => x.value));
        if (values.size !== o.length) problems.push(where + ": two select options share a value");
      }
      if (c.placeholder && c.placeholder.length > 150) problems.push(where + ": placeholder over 150 characters");
      if (c.type === 4) {
        if (!inModal) problems.push(where + ": a text input outside a modal");
        if (!c.label || c.label.length > 45) problems.push(where + ": text input label must be 1-45 characters (" + c.label + ")");
        if (c.value && c.max_length && c.value.length > c.max_length) problems.push(where + ": prefilled value longer than max_length");
        if (c.max_length && c.max_length > 4000) problems.push(where + ": max_length over 4000");
      }
    }
  }
}
function checkPayload(where, payload) {
  checked += 1;
  if (!payload || typeof payload !== "object") { problems.push(where + ": no reply was built"); return; }
  if (payload.postPanelTo) return;
  if (payload.custom_id && payload.title !== undefined && Array.isArray(payload.components)) {
    if (!payload.title || payload.title.length > 45) problems.push(where + ": modal title must be 1-45 characters (" + payload.title + ")");
    if (payload.custom_id.length > 100) problems.push(where + ": modal custom_id over 100 characters");
    checkComponents(where + " (modal)", payload.components, true);
    return;
  }
  if (payload.content !== undefined && String(payload.content).length > 2000) problems.push(where + ": message over 2000 characters");
  const embeds = payload.embeds || [];
  if (embeds.length > 10) problems.push(where + ": more than 10 embeds");
  let total = 0;
  embeds.forEach((e, i) => {
    const w = where + " embed " + (i + 1);
    if (e.title && e.title.length > 256) problems.push(w + ": title over 256 characters");
    if (e.description && e.description.length > 4096) problems.push(w + ": description over 4096 characters");
    if (e.fields && e.fields.length > 25) problems.push(w + ": more than 25 fields");
    for (const f of e.fields || []) {
      if (!f.name || f.name.length > 256) problems.push(w + ": field name must be 1-256 characters (" + f.name + ")");
      if (f.value === undefined || f.value === null || String(f.value).trim() === "" || String(f.value).length > 1024) problems.push(w + ": field \"" + f.name + "\" value must be 1-1024 characters (is " + String(f.value ?? "").length + ")");
      total += (f.name || "").length + String(f.value || "").length;
    }
    if (e.footer && e.footer.text && e.footer.text.length > 2048) problems.push(w + ": footer over 2048 characters");
    total += (e.title || "").length + (e.description || "").length + ((e.footer && e.footer.text) || "").length;
  });
  if (total > 6000) problems.push(where + ": embeds over 6000 characters in total");
  if (!embeds.length && !payload.content && !(payload.components && payload.components.length)) problems.push(where + ": an empty reply");
  checkComponents(where, payload.components, false);
}

  return {
    problems,
    get checked() { return checked; },
    count() { checked += 1; },
    checkPayload,
  };
}
