/* ==========================================================================
   Runtime configuration — shared by index.html and the status, updates, login
   and admin pages.
   ========================================================================== */

/* Base URL of the bot's HTTP API. Every page reads this one value, so if the
   API ever moves, change it here only. */
window.RW_API = 'https://api.rustyworksrce.xyz';

/* Trim a trailing slash so page code can append '/api/...' safely. */
window.RW_API = window.RW_API.replace(/\/+$/, '');

/* What the product is called, in one place. Pages carry the name in their own
   markup (titles and copy are static, which is what search engines want), but
   anything a script prints - summaries, downloads, exported files - reads it
   here, so a rename only has to be made once. */
window.RW_BRAND = {
  name: 'Spinback RCE',
  short: 'Spinback',
  tagline: 'The free all-in-one Discord bot for Rust Console Edition servers.',
  site: 'https://rustyworks-rce-j7ao5f.camelai.app'
};
