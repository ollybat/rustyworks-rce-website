/* ==========================================================================
   Runtime configuration — shared by index.html and the status, updates, login
   and admin pages.
   ========================================================================== */

/* Base URL of the bot's HTTP API. Every page reads this one value, so if the
   API ever moves, change it here only. */
window.RW_API = 'https://api.rustyworksrce.xyz';

/* Trim a trailing slash so page code can append '/api/...' safely. */
window.RW_API = window.RW_API.replace(/\/+$/, '');
