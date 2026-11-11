
// ════════════════════════════════════════════════════════════════════════════
// ITEM DATA — items only appear if matching PNG exists in /media/kitbuilder/
// ════════════════════════════════════════════════════════════════════════════
let CATS = {};          // populated by loadEntities() from entities.json
const WEARABLE = new Set(); // populated by loadEntities()

// How the 15 JSON categories collapse into 9 builder categories
const REMAP = {
  // ── Weapons ──────────────────────────────────────────────────────────────
  'Rifles & MGs': [
    ['Weapons','Rifles and Machine Guns'],
  ],
  'Shotguns': [
    ['Weapons','Shotguns'],
  ],
  'SMGs & Pistols': [
    ['Weapons','SMGs'],['Weapons','Pistols'],
  ],
  'Bows & Launchers': [
    ['Weapons','Basic'],['Weapons','Others'],
  ],
  'Melee': [
    ['Weapons','Melee'],
  ],
  'Grenades & Thrown': [
    ['Weapons','Thrown'],
  ],
  'Weapon Mods': [
    ['Weapons','Weapon Attachments'],
  ],
  // ── Ammo ─────────────────────────────────────────────────────────────────
  'Ammo — Bullets': [
    ['Ammunition','Bullets'],
  ],
  'Ammo — Explosive': [
    ['Ammunition','Rocket'],['Ammunition','Shells'],['Ammunition','Arrows'],
  ],
  // ── Armour & Clothing ────────────────────────────────────────────────────
  'Armour': [
    ['Armour','Head'],['Armour','Torso'],['Armour','Legs'],
  ],
  'Clothing': [
    ['Attire','Head'],['Attire','Torso'],['Attire','Legs'],
    ['Attire','Hands And Feet'],['Attire','Diving'],['Attire','Misc'],
  ],
  // ── Survival ─────────────────────────────────────────────────────────────
  'Tools': [
    ['Tools','Mining'],['Tools','Woodcutting'],['Tools','Others'],
    ['Tools','Hybrid'],['Tools','Water Container'],['Tools','Lighting'],
    ['Tools','Building and Systems'],
  ],
  'Explosives': [
    ['Tools','Explosives'],
  ],
  'Medical': [
    ['Medical','General'],
  ],
  'Food & Meat': [
    ['Food','Others'],['Food','Meat'],['Food','Fish'],['Food','Crops'],
  ],
  'Teas': [
    ['Food','Teas'],
  ],
  // ── Resources ────────────────────────────────────────────────────────────
  'Resources': [
    ['Resources','Basic'],
  ],
  'Components': [
    ['Resources','Components'],['Resources','Recycling'],
  ],
  // ── Base & Electronics ───────────────────────────────────────────────────
  'Building': [
    ['Construction','Doors'],['Construction','Wall and Floors'],
    ['Construction','Barricades And High Walls'],['Construction','Windows'],
  ],
  'Storage & Items': [
    ['Items','Crafting'],['Items','Storage'],['Items','Survival'],
    ['Items','Others'],['Items','Comfort'],
    ['Traps','General'],['Others','General'],
  ],
  'Electronics': [
    ['Systems','Electric I/O'],['Systems','Power Sources'],['Systems','Powered Items'],
    ['Systems','Automation'],['Systems','Lighting'],
    ['Systems','Logic Gates'],['Systems','Fluid I/O'],['Systems','Wireless'],
  ],
  // ── Extra ────────────────────────────────────────────────────────────────
  'Vehicles': [
    ['Vehicles','Land'],['Vehicles','Water'],
    ['Vehicles','Special'],['Vehicles','Powered Items'],
  ],
  'DLC & Events': [
    ['Additional Content','Frontiersman DLC'],['Additional Content','Lumberjack DLC'],
    ['Additional Content','Nomad DLC'],['Additional Content','Ice King DLC'],
    ['Additional Content','Artic DLC'],['Additional Content','Halloween Event'],
    ['Additional Content','Exhibit Decor Pack DLC'],['Additional Content','Frontier Decor DLC'],
    ['Additional Content','Adobe'],['Additional Content','Legacy Wood DLC'],
    ['Additional Content','Chicken Costume DLC'],['Additional Content','Horse Costume DLC'],
    ['Additional Content','Industrial Lights DLC'],['Additional Content','Weapon Racks DLC'],
  ],
};

// Source categories whose items go into Wear slots
const WEAR_SOURCES = [
  ['Armour','Head'],['Armour','Torso'],['Armour','Legs'],
  ['Attire','Head'],['Attire','Torso'],['Attire','Legs'],
  ['Attire','Hands And Feet'],['Attire','Diving'],['Attire','Misc'],
];

// Human-readable label overrides — auto-generated for anything not listed
function toLabel(sn) {
  const OV = {
    'rifle.ak':'AK-47','rifle.bolt':'Bolt Action Rifle','rifle.lr300':'LR-300',
    'lmg.m249':'M249','rifle.l96':'L96 Rifle','rifle.m39':'M39 Rifle',
    'hmlmg':'HMLMG','minigun':'Minigun','smg.mp5':'MP5',
    'smg.2':'Custom SMG','smg.thompson':'Thompson','t1_smg':'T1 SMG',
    'rifle.semiauto':'Semi-Auto Rifle','rifle.sks':'SKS',
    'pistol.m92':'M92 Pistol','pistol.prototype17':'Prototype 17',
    'pistol.python':'Python','pistol.semiauto':'Semi-Auto Pistol',
    'pistol.eoka':'Eoka','pistol.revolver':'Revolver','revolver.hc':'HC Revolver',
    'pistol.nailgun':'Nail Gun','speargun':'Spear Gun',
    'shotgun.spas12':'Spas-12','shotgun.pump':'Pump Shotgun',
    'shotgun.double':'Double Barrel','shotgun.waterpipe':'Waterpipe','shotgun.m4':'M4 Shotgun',
    'bow.hunting':'Hunting Bow','bow.compound':'Compound Bow','crossbow':'Crossbow',
    'rocket.launcher':'Rocket Launcher','flamethrower':'Flamethrower',
    'homingmissile.launcher':'Homing Launcher','multiplegrenadelauncher':'Multi-GL',
    'military flamethrower':'Military Flamethrower',
    'ammo.rifle':'5.56 Rifle Ammo','ammo.rifle.explosive':'5.56 HE',
    'ammo.rifle.hv':'5.56 HV','ammo.rifle.incendiary':'5.56 Incen',
    'ammo.pistol':'Pistol Ammo','ammo.pistol.fire':'Pistol Incen','ammo.pistol.hv':'Pistol HV',
    'ammo.rocket.basic':'Rocket','ammo.rocket.fire':'Incen Rocket',
    'ammo.rocket.hv':'HV Rocket','ammo.rocket.seeker':'Seeker Rocket',
    'ammo.rocket.mlrs':'MLRS Rocket','ammo.rocket.sam':'SAM Ammo',
    'ammo.handmade.shell':'Handmade Shell','ammo.shotgun':'Buckshot',
    'ammo.shotgun.fire':'Incen Shells','ammo.shotgun.slug':'Slug',
    'ammo.grenadelauncher.buckshot':'GL Buckshot','ammo.grenadelauncher.he':'GL HE',
    'ammo.grenadelauncher.smoke':'GL Smoke',
    'arrow.hv':'HV Arrow','arrow.fire':'Fire Arrow',
    'arrow.wooden':'Wood Arrow','arrow.bone':'Bone Arrow',
    'ammo.nailgun.nails':'Nailgun Nails','speargun.spear':'Spear Gun Spear',
    'submarine.torpedo.straight':'Torpedo',
    'weapon.mod.holosight':'Holo Sight','weapon.mod.lasersight':'Laser Sight',
    'weapon.mod.flashlight':'Flashlight Mod','weapon.mod.silencer':'Silencer',
    'weapon.mod.extendedmags':'Extended Mag','weapon.mod.muzzleboost':'Muzzle Boost',
    'weapon.mod.muzzlebrake':'Muzzle Brake','weapon.mod.small.scope':'4x Scope',
    'weapon.mod.burstmodule':'Burst Module','weapon.mod.simplesight':'Simple Sight',
    'weapon.mod.gascompressionovedrive':'Gas Comp Overdrive',
    'weapon.mod.oilfiltersilencer':'Oil Filter Silencer',
    'weapon.mod.sodacansilencer':'Soda Can Silencer',
    'metal.plate.torso':'Metal Chest Plate','metal.facemask':'Metal Facemask',
    'heavy.plate.helmet':'HP Helmet','heavy.plate.jacket':'HP Jacket',
    'heavy.plate.pants':'HP Pants','coffeecan.helmet':'Coffee Can Helmet',
    'roadsign.jacket':'Road Sign Jacket','roadsign.kilt':'Road Sign Kilt',
    'roadsign.gloves':'Road Sign Gloves','tactical.gloves':'Tactical Gloves',
    'wood.armor.helmet':'Wood Helmet','wood.armor.jacket':'Wood Chest',
    'wood.armor.pants':'Wood Pants','bone.armor.suit':'Bone Armor',
    'hazmatsuit':'Hazmat Suit','deer.skull.mask':'Deer Skull Mask',
    'riot.helmet':'Riot Helmet','bucket.helmet':'Bucket Helmet',
    'tshirt':'T-Shirt','tshirt.long':'Long Sleeve','shirt.collared':'Collared Shirt',
    'shirt.tanktop':'Tank Top','hoodie':'Hoodie','burlap.shirt':'Burlap Shirt',
    'attire.hide.helterneck':'Hide Halterneck','attire.hide.vest':'Hide Vest',
    'attire.hide.poncho':'Hide Poncho','jacket':'Jacket','jacket.snow':'Snow Jacket',
    'lumberjack hoodie':'Lumberjack Hoodie',
    'attire.hide.skirt':'Hide Skirt','burlap.trousers':'Burlap Trousers',
    'pants':'Pants','attire.hide.pants':'Hide Pants','pants.shorts':'Shorts',
    'shoes.boots':'Boots','attire.hide.boots':'Hide Boots',
    'burlap.shoes':'Burlap Shoes','boots.frog':'Frog Boots',
    'burlap.gloves':'Burlap Gloves','burlap.gloves.new':'Burlap Gloves (New)',
    'hat.beenie':'Beenie','hat.boonie':'Boonie Hat','burlap.headwrap':'Burlap Headwrap',
    'hat.cap':'Baseball Cap','hat.wolf':'Wolf Headdress','hat.miner':'Miners Hat',
    'hat.candle':'Candle Hat','mask.balaclava':'Balaclava','mask.bandana':'Bandana',
    'nightvisiongoggles':'NVG','partyhat':'Party Hat','prisonerhood':'Prison Hood',
    'diving.wetsuit':'Wetsuit','diving.mask':'Diving Mask',
    'diving.tank':'Diving Tank','diving.fins':'Diving Fins',
    'largebackpack':'Large Backpack','smallbackpack':'Small Backpack',
    'parachute':'Parachute','hazmatsuit_scientist':'Scientist Suit',
    'scientistsuit_heavy':'Heavy Scientist Suit',
    'hazmatsuit_scientist_peacekeeper':'Peacekeeper Suit',
    'attire.banditguard':'Bandit Guard Suit',
    'hazmatsuit_scientist_arctic':'Arctic Scientist Suit',
    'jumpsuit.waterwellnpc':'Jumpsuit',
    'grenade.f1':'F1 Grenade','grenade.beancan':'Beancan Grenade',
    'grenade.flashbang':'Flashbang','grenade.molotov':'Molotov',
    'grenade.smoke':'Smoke Grenade','explosive.timed':'C4',
    'explosive.satchel':'Satchel Charge',
    'syringe.medical':'Medical Syringe','largemedkit':'Large Medkit',
    'antiradpills':'Anti-Rad Pills','bandage':'Bandage',
    'smallwaterbottle':'Small Water Bottle',
    'chocholate':'Chocolate','can.beans':'Canned Beans','can.tuna':'Canned Tuna',
    'black.raspberries':'Black Raspberries','blueberries':'Blueberries',
    'cactusflesh':'Cactus Flesh','granolabar':'Granola Bar','grub':'Grub',
    'mushroom':'Mushroom','jar.pickle':'Pickles','worm':'Worm',
    'bottle.vodka':'Vodka','apple':'Apple',
    'healingtea':'Healing Tea','healingtea.advanced':'Adv Healing Tea','healingtea.pure':'Pure Healing Tea',
    'oretea':'Ore Tea','oretea.advanced':'Adv Ore Tea','oretea.pure':'Pure Ore Tea',
    'scraptea':'Scrap Tea','scraptea.advanced':'Adv Scrap Tea','scraptea.pure':'Pure Scrap Tea',
    'woodtea':'Wood Tea','woodtea.advanced':'Adv Wood Tea','woodtea.pure':'Pure Wood Tea',
    'maxhealthtea':'Max Health Tea','maxhealthtea.advanced':'Adv Max Health Tea','maxhealthtea.pure':'Pure Max Health Tea',
    'radiationresisttea':'Rad Resist Tea','radiationresisttea.advanced':'Adv Rad Resist Tea','radiationresisttea.pure':'Pure Rad Resist Tea',
    'chicken.cooked':'Cooked Chicken','fish.cooked':'Cooked Fish',
    'humanmeat.cooked':'Cooked Human Meat','bearmeat.cooked':'Cooked Bear',
    'deermeat.cooked':'Cooked Deer','horsemeat.cooked':'Cooked Horse',
    'meat.pork.cooked':'Cooked Pork','wolfmeat.cooked':'Cooked Wolf',
    'metal.fragments':'Metal Frags','metal.refined':'High Quality Metal',
    'hq.metal.ore':'HQM Ore','metal.ore':'Metal Ore',
    'sulfur.ore':'Sulfur Ore','sulfur':'Sulfur','lowgradefuel':'Low Grade Fuel',
    'crude.oil':'Crude Oil','gunpowder':'Gun Powder','scrap':'Scrap',
    'stones':'Stones','wood':'Wood','cloth':'Cloth','leather':'Leather',
    'fat.animal':'Animal Fat','charcoal':'Charcoal','bone.fragments':'Bone Fragments',
    'gears':'Gears','riflebody':'Rifle Body','semibody':'Semi-Auto Body',
    'smgbody':'SMG Body','metalspring':'Metal Spring','techparts':'Tech Trash',
    'metalblade':'Metal Blade','metalpipe':'Metal Pipe','sewingkit':'Sewing Kit',
    'sheetmetal':'Sheet Metal','rope':'Rope','roadsigns':'Road Signs','fuse':'Fuse',
    'keycard_red':'Red Keycard','keycard_blue':'Blue Keycard','keycard_green':'Green Keycard',
    'cupboard.tool':'Tool Cupboard','workbench1':'T1 Workbench',
    'workbench2':'T2 Workbench','workbench3':'T3 Workbench',
    'furnace':'Furnace','furnace.large':'Large Furnace',
    'small.oil.refinery':'Oil Refinery','research.table':'Research Table',
    'mixingtable':'Mixing Table','composter':'Composter',
    'box.wooden':'Small Box','box.wooden.large':'Large Box',
    'lock.code':'Code Lock','autoturret':'Auto Turret',
    'jackhammer':'Jackhammer','stone.pickaxe':'Stone Pickaxe',
    'pickaxe':'Metal Pickaxe','icepick.salvaged':'Salvaged Ice Pick',
    'hatchet':'Metal Hatchet','stonehatchet':'Stone Hatchet',
    'axe.salvaged':'Salvaged Axe','chainsaw':'Chainsaw',
    'torch':'Torch','hammer':'Hammer','building.planner':'Building Plan',
    'sleepingbag':'Sleeping Bag','bed':'Bed',
    'teslacoil':'Tesla Coil',
  };
  if (OV[sn]) return OV[sn];
  return sn.replace(/[._]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}

async function loadEntities() {
  let raw = {};
  try {
    raw = await fetch('/media/entitys/entities.json').then(r => r.json());
  } catch(e) {
    console.warn('[KitBuilder] entities.json failed to load:', e.message);
    return; // CATS stays empty — builder will show nothing, not crash
  }

  // Build WEARABLE set from Armour + Attire (excluding Horse subcategories)
  WEAR_SOURCES.forEach(([cat, sub]) => {
    (raw[cat]?.[sub] || []).forEach(sn => WEARABLE.add(sn));
  });

  // Build CATS from REMAP — deduplicate within each category
  for (const [catLabel, sources] of Object.entries(REMAP)) {
    const seen = new Set();
    const items = [];
    for (const [cat, sub] of sources) {
      (raw[cat]?.[sub] || []).forEach(sn => {
        if (!seen.has(sn)) { seen.add(sn); items.push({ v: sn, l: toLabel(sn) }); }
      });
    }
    if (items.length) CATS[catLabel] = items;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════════════
const KIT = {
  name: '',
  wear: Array(7).fill(null),
  main: Array(24).fill(null),
  belt: Array(6).fill(null)
};
let SEL    = null;  // {v, l} selected item from browser
let QP     = null;  // {pos, idx} open qty popover
let imgOK  = {};    // cache: shortname -> true if PNG loaded
let USER   = null;  // logged-in user data
let MANAGE_MODE = 'load'; // 'load' or 'manage'

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════
const API = () => window.RW_API || '';
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function toast(msg,err=false){const t=document.getElementById('toast');t.textContent=msg;t.style.borderColor=err?'#e74c3c':'var(--rust)';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function closeModal(id){document.getElementById(id).style.display='none'}
function safeB64Enc(s){try{return btoa(unescape(encodeURIComponent(s)))}catch{return btoa(s)}}
function safeB64Dec(s){try{return decodeURIComponent(escape(atob(s)))}catch{return atob(s)}}
function fmtNum(n){return Number(n||0).toLocaleString()}
function kitHasItems(){return [...KIT.wear,...KIT.main,...KIT.belt].some(Boolean)}
	
// ── Custom Confirm Logic ──
let _confirmResolver = null;
function openConfirm(title, desc, confirmBtnText = 'Yes', btnClass = 'danger') {
  return new Promise(resolve => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmDesc').textContent = desc;
    const btn = document.getElementById('confirmOkBtn');
    btn.textContent = confirmBtnText;
    btn.className = `btn ${btnClass}`;
    document.getElementById('confirmModal').style.display = 'flex';
    _confirmResolver = resolve;
  });
}
function closeConfirmModal(ev) {
  if (ev && ev.target !== document.getElementById('confirmModal')) return;
  document.getElementById('confirmModal').style.display = 'none';
  if (_confirmResolver) _confirmResolver(false);
  _confirmResolver = null;
}
document.getElementById('confirmOkBtn').addEventListener('click', () => {
  document.getElementById('confirmModal').style.display = 'none';
  if (_confirmResolver) _confirmResolver(true);
  _confirmResolver = null;
});

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════
async function init() {
  await loadEntities();
  buildCatBar();
  buildAllSlots();
  loadStats();
  checkAuth();
  setupServerPresets(); // Initialize Presets
  selectCategory(Object.keys(CATS)[0]);
  document.addEventListener('click', (e) => {
    if (!document.getElementById('qtyPop').contains(e.target)) closeQP();
  });
}
	
// ── Resizable panel divider ──────────────────────────────────────────────────
(function() {
  const handle  = document.getElementById('resizeHandle');
  const browser = document.getElementById('kbBrowser');
  if (!handle || !browser) return;

  let active = false, startX = 0, startW = 0;

  function onStart(e) {
    if (window.innerWidth <= 900) return; // mobile: no resize
    active  = true;
    startX  = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    startW  = browser.offsetWidth;
    handle.classList.add('rh-active');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }
  function onMove(e) {
    if (!active) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    browser.style.width = Math.max(180, Math.min(540, startW + cx - startX)) + 'px';
  }
  function onEnd() {
    if (!active) return;
    active = false;
    handle.classList.remove('rh-active');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  }

  handle.addEventListener('mousedown', onStart);
  handle.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', e => { if (active) { e.preventDefault(); onMove(e); } }, { passive: false });
  document.addEventListener('mouseup',   onEnd);
  document.addEventListener('touchend',  onEnd);
})();

async function loadStats() {
  if (!API()) return;
  try {
    const d = await fetch(`${API()}/api/kitbuilder/stats`).then(r=>r.json());
    document.getElementById('stGen').textContent   = fmtNum(d.generated);
    document.getElementById('stSaved').textContent = fmtNum(d.saved);
  } catch {}
}

async function checkAuth() {
  if (!API()) return;
  try {
    const d = await fetch(`${API()}/auth/me`,{credentials:'include'}).then(r=>r.json());
    USER = d?.authenticated ? d : null;
  } catch { USER = null; }
  updateAuthButtons();
}

function updateAuthButtons() {
  const notice = USER ? '' : '<div class="login-notice">🔑to save and load your kits</div>';
  const existing = document.getElementById('authNotice');
  if (!existing && !USER) {
    const wrap = document.createElement('div');
    wrap.id = 'authNotice';
    wrap.innerHTML = notice;
    document.querySelector('.kb-btns-2').after(wrap);
  } else if (existing) {
    existing.innerHTML = USER ? '' : notice;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MOBILE TABS
// ════════════════════════════════════════════════════════════════════════════
function setMobTab(tab) {
  const isMob = window.innerWidth <= 900;
  if (!isMob) return;
  const btns = document.querySelectorAll('.kmt');
  btns.forEach((b,i) => b.classList.toggle('active', (i===0&&tab==='inventory')||(i===1&&tab==='browse')));
  document.getElementById('kbInventory').classList.toggle('mob-hidden', tab==='browse');
  document.getElementById('kbBrowser').classList.toggle('mob-hidden', tab==='inventory');
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY BROWSER
// ════════════════════════════════════════════════════════════════════════════
function buildCatBar() {
  const bar = document.getElementById('catBar');
  bar.innerHTML = Object.keys(CATS).map(cat =>
    `<button class="kb-cat" onclick="selectCategory('${esc(cat.replace(/'/g,"\\'"))}')">${esc(cat)}</button>`
  ).join('');
}

function selectCategory(cat) {
  document.querySelectorAll('.kb-cat').forEach(b => b.classList.toggle('active', b.textContent===cat));
  document.getElementById('itemSearch').value = '';
  renderItemGrid(CATS[cat] || []);
}

function filterItems() {
  const q = document.getElementById('itemSearch').value.toLowerCase().trim();
  if (!q) { selectCategory(document.querySelector('.kb-cat.active')?.textContent || Object.keys(CATS)[0]); return; }
  const matches = [];
  for (const [,items] of Object.entries(CATS)) items.forEach(item => { if (item.l.toLowerCase().includes(q)||item.v.toLowerCase().includes(q)) matches.push(item); });
  renderItemGrid(matches, true);
}

function renderItemGrid(items, isSearch=false) {
  const grid = document.getElementById('itemsGrid');
  grid.innerHTML = '';
  if (!items.length) { grid.innerHTML = '<div class="no-items">No items found</div>'; return; }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'bi' + (SEL?.v === item.v ? ' selected' : '');
    div.dataset.v = item.v;
    div.dataset.l = item.l;
    div.draggable = true;

    const lbl = document.createElement('span');
    lbl.className = 'bi-lbl';
    lbl.textContent = item.l;

    if (imgOK[item.v] === false) {
      // Known missing — show letter placeholder so item is still usable
      const ph = document.createElement('div');
      ph.className = 'bi-ph';
      ph.textContent = item.l.slice(0,3).toUpperCase();
      div.appendChild(ph);
      div.appendChild(lbl);
      setupBrowserItem(div, item);
      grid.appendChild(div);
      return;
    }

    if (imgOK[item.v] === true) {
      // Known good — render immediately
      const img = document.createElement('img');
      img.className = 'bi-img'; img.alt = ''; img.draggable = false;
      img.src = `/media/kitbuilder/${item.v}.png`;
      div.appendChild(img);
      div.appendChild(lbl);
      setupBrowserItem(div, item);
      grid.appendChild(div);
      return;
    }

    // Unknown — add to grid right away with just the label, then
    // swap in the image (or placeholder) once the load attempt resolves
    div.appendChild(lbl);
    setupBrowserItem(div, item);
    grid.appendChild(div); // visible immediately — no more invisible items

    const img = document.createElement('img');
    img.className = 'bi-img'; img.alt = ''; img.draggable = false;
    img.onload = () => {
      imgOK[item.v] = true;
      div.insertBefore(img, lbl); // slide image in above the label
    };
    img.onerror = () => {
      imgOK[item.v] = false;
      const ph = document.createElement('div');
      ph.className = 'bi-ph';
      ph.textContent = item.l.slice(0,3).toUpperCase();
      div.insertBefore(ph, lbl); // slide placeholder in above the label
    };
    img.src = `/media/kitbuilder/${item.v}.png`;
  });
}

function setupBrowserItem(div, item) {
  div.addEventListener('click', () => selectItem(item.v, item.l));
  div.addEventListener('dragstart', e => {

[706 more lines in file. Use offset=501 to continue.]
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ITEM SELECTION
// ════════════════════════════════════════════════════════════════════════════
function selectItem(v, l) {
  if (SEL?.v === v) { clearSel(); return; }
  SEL = {v, l};
  document.querySelectorAll('.bi').forEach(el => el.classList.toggle('selected', el.dataset.v===v));
  const bar = document.getElementById('selBar');
  bar.classList.add('active');
  document.getElementById('selName').textContent = l;
  const img = document.getElementById('selImg');
  img.src = `/media/kitbuilder/${v}.png`;
  img.style.opacity = '';
  // On mobile, auto-switch to inventory
  if (window.innerWidth <= 900) setMobTab('inventory');
}

function clearSel() {
  SEL = null;
  document.querySelectorAll('.bi').forEach(el => el.classList.remove('selected'));
  document.getElementById('selBar').classList.remove('active');
}

// ════════════════════════════════════════════════════════════════════════════
// SLOT RENDERING
// ════════════════════════════════════════════════════════════════════════════
function buildAllSlots() {
  buildSlotGrid('wearGrid', 'wear', 7, 'wear-slot');
  buildSlotGrid('mainGrid', 'main', 24, 'main-slot');
  buildSlotGrid('beltGrid', 'belt', 6, 'belt-slot');
}

function buildSlotGrid(gridId, pos, count, cls) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const slot = document.createElement('div');
    slot.id = `slot_${pos}_${i}`;
    slot.className = `slot ${cls}`;
    slot.dataset.pos = pos;
    slot.dataset.idx = i;
    // Click
    slot.addEventListener('click', e => { e.stopPropagation(); onSlotClick(pos, i); });
    // DnD drop target
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => { e.preventDefault(); slot.classList.remove('drag-over'); onSlotDrop(e, pos, i); });
    renderSlot(pos, i);
    grid.appendChild(slot);
  }
}

function renderSlot(pos, idx) {
  const slot = document.getElementById(`slot_${pos}_${idx}`);
  if (!slot) return;
  const item = KIT[pos][idx];
  slot.classList.toggle('filled', !!item);
  if (!item) {
    slot.innerHTML = '<div class="slot-plus">+</div>';
    return;
  }
  const imgSrc = `/media/kitbuilder/${item.v}.png`;
  slot.innerHTML = `
    <img class="slot-img" src="${imgSrc}" alt="" onerror="this.style.display='none'">
    <span class="slot-qty">×${fmtNum(item.qty)}</span>
    <button class="slot-rm" onclick="removeSlot(event,'${pos}',${idx})">✕</button>`;
}

function renderAllSlots() {
  for (let i=0;i<7;i++) renderSlot('wear',i);
  for (let i=0;i<24;i++) renderSlot('main',i);
  for (let i=0;i<6;i++) renderSlot('belt',i);
}

// ════════════════════════════════════════════════════════════════════════════
// SLOT INTERACTIONS
// ════════════════════════════════════════════════════════════════════════════
function onSlotClick(pos, idx) {
  closeQP();
  const existing = KIT[pos][idx];
  if (existing) { openQP(pos, idx); return; }
  // Empty slot — place selected item
  if (!SEL) return;
  if (pos === 'wear' && !WEARABLE.has(SEL.v)) { toast('That item can\'t go in Wear slots.', true); return; }
  openQtyDialog(pos, idx);
}

// Click to place: open small qty confirm
function openQtyDialog(pos, idx) {
  openQP(pos, idx, true); // new = true
}

function onSlotDrop(e, pos, idx) {
  const raw = e.dataTransfer.getData('text/plain');
  if (!raw) return;
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  if (data.src === 'browser') {
    const item = data;
    if (pos === 'wear' && !WEARABLE.has(item.v)) { toast('That item can\'t go in Wear slots.', true); return; }
    const existing = KIT[pos][idx];
    KIT[pos][idx] = { v: item.v, l: item.l, qty: 1 };
    renderSlot(pos, idx);
    updateOutput();
    if (!existing) toast(`${item.l} added to ${pos}`);
  } else if (data.src === 'slot') {
    const from = data;
    if (pos === 'wear' && KIT[from.pos][from.idx] && !WEARABLE.has(KIT[from.pos][from.idx].v)) {
      toast('That item can\'t go in Wear slots.', true); return;
    }
    const tmp = KIT[pos][idx];
    KIT[pos][idx] = KIT[from.pos][from.idx];
    KIT[from.pos][from.idx] = tmp;
    renderSlot(pos, idx);
    renderSlot(from.pos, from.idx);
    updateOutput();
  }
}

function removeSlot(e, pos, idx) {
  e.stopPropagation();
  KIT[pos][idx] = null;
  renderSlot(pos, idx);
  updateOutput();
}

// Make filled slots draggable (called after render)
document.addEventListener('dragstart', e => {
  const slot = e.target.closest('.slot.filled');
  if (!slot) return;
  const {pos, idx} = slot.dataset;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({src:'slot',pos,idx:Number(idx)}));
});

// ════════════════════════════════════════════════════════════════════════════
// QTY POPOVER
// ════════════════════════════════════════════════════════════════════════════
function openQP(pos, idx, isNew=false) {
  const item = KIT[pos][idx];
  QP = {pos, idx, isNew};
  const pop = document.getElementById('qtyPop');
  document.getElementById('qpName').textContent = item ? item.l : (SEL?.l || '');
  document.getElementById('qpVal').value = item ? item.qty : 1;
  pop.style.display = 'block';
  // Position near slot
  const slot = document.getElementById(`slot_${pos}_${idx}`);
  if (slot) {
    const r = slot.getBoundingClientRect();
    const pw = pop.offsetWidth || 180;
    let left = r.left + r.width/2 - pw/2;
    let top  = r.bottom + 6;
    // Keep within viewport
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    if (r.bottom + 160 > window.innerHeight) top = r.top - 160;
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
  }
  setTimeout(() => document.getElementById('qpVal').select(), 50);
}

function closeQP() {
  QP = null;
  document.getElementById('qtyPop').style.display = 'none';
}

function qpAdj(d) {
  const inp = document.getElementById('qpVal');
  inp.value = Math.max(1, (parseInt(inp.value)||1) + d);
}

function qpSave() {
  if (!QP) return;
  const {pos, idx, isNew} = QP;
  const qty = Math.max(1, parseInt(document.getElementById('qpVal').value)||1);
  if (isNew) {
    if (!SEL) { closeQP(); return; }
    KIT[pos][idx] = { v: SEL.v, l: SEL.l, qty };
  } else {
    if (KIT[pos][idx]) KIT[pos][idx].qty = qty;
  }
  renderSlot(pos, idx);
  updateOutput();
  closeQP();
}

function qpRemove() {
  if (!QP) return;
  KIT[QP.pos][QP.idx] = null;
  renderSlot(QP.pos, QP.idx);
  updateOutput();
  closeQP();
}

// ════════════════════════════════════════════════════════════════════════════
// COMMANDS GENERATION
// ════════════════════════════════════════════════════════════════════════════
function buildCommands(name) {
  const cmds = [`kit remove "${name}"`, `kit add "${name}"`];
  KIT.wear.forEach(item => { if (item) cmds.push(`kit add "${name}" ${item.v} ${item.qty} 1 wear`); });
  KIT.main.forEach(item => { if (item) cmds.push(`kit add "${name}" ${item.v} ${item.qty} 1 main`); });
  KIT.belt.forEach(item => { if (item) cmds.push(`kit add "${name}" ${item.v} ${item.qty} 1 belt`); });
  return cmds;
}

function updateOutput() {
  KIT.name = document.getElementById('kitName').value.trim().replace(/\s+/g,'_').toUpperCase() || 'MY_KIT';
  if (!kitHasItems()) { document.getElementById('cmdOutput').value = ''; return; }
  document.getElementById('cmdOutput').value = buildCommands(KIT.name).join('\n');
}

async function incrementGenerated() {
  if (!API()) return;
  try {
    const d = await fetch(`${API()}/api/kitbuilder/generate`,{method:'POST',credentials:'include'}).then(r=>r.json());
    if (d.generated) document.getElementById('stGen').textContent = fmtNum(d.generated);
  } catch {}
}

async function doAction(type) {
  KIT.name = document.getElementById('kitName').value.trim().replace(/\s+/g,'_').toUpperCase() || 'MY_KIT';
  if (!kitHasItems()) { toast('Add some items to the kit first.', true); return; }
  const cmds = buildCommands(KIT.name);
  if (type === 'commands') {
    const text = cmds.join('\n');
    await copyText(text);
    toast('📋 RCON commands copied!');
  } else {
    const code = safeB64Enc(cmds.join('\n'));
    await copyText(code);
    document.getElementById('cmdOutput').value = code;
    toast('⚡ Install code copied!');
  }
  incrementGenerated();
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch {}
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText='position:fixed;top:-9999px';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy');
  document.body.removeChild(ta);
}

async function clearAll() {
  if (kitHasItems() && !(await openConfirm('Clear All Items?', 'Clear all items and reset the kit?', 'Yes, Clear All', 'danger'))) return;
  KIT.wear.fill(null); KIT.main.fill(null); KIT.belt.fill(null);
  document.getElementById('kitName').value = '';
  renderAllSlots(); updateOutput(); clearSel();
  toast('Kit cleared.');
}

// ════════════════════════════════════════════════════════════════════════════
// IMPORT
// ════════════════════════════════════════════════════════════════════════════
function openImportModal() { document.getElementById('importTa').value=''; document.getElementById('importModal').style.display='flex'; }

function doImport() {
  const raw = document.getElementById('importTa').value.trim();
  if (!raw) { toast('Paste a code or commands first.', true); return; }
  let text = raw;
  // Try Base64 decode
  try {
    const dec = safeB64Dec(raw);
    if (dec.toLowerCase().includes('kit ')) text = dec;
  } catch {}
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  // Clear current
  KIT.wear.fill(null); KIT.main.fill(null); KIT.belt.fill(null);
  // Parse kit name
  for (const line of lines) {
    const m = line.match(/^kit\s+add\s+"?([^"\s]+)"?\s+"?([^"\s]+)"?\s+(\d+)(?:\s+\d+)?\s+(wear|main|belt)/i);
    if (!m) continue;
    const [,,shortname,qtyStr,posRaw] = m;
    const qty = Math.max(1, parseInt(qtyStr)||1);
    const pos = posRaw.toLowerCase();
    if (!['wear','main','belt'].includes(pos)) continue;
    // Find first empty slot
    const arr = KIT[pos];
    const emptyIdx = arr.findIndex(s=>!s);
    if (emptyIdx === -1) continue;
    // Check wear constraint
    if (pos === 'wear' && !WEARABLE.has(shortname)) continue;
    // Find label
    let label = shortname;
    for (const [,items] of Object.entries(CATS)) { const it = items.find(i=>i.v===shortname); if(it){label=it.l;break;} }
    arr[emptyIdx] = {v:shortname,l:label,qty};
  }
  renderAllSlots(); updateOutput(); closeModal('importModal');
  toast('✅ Kit imported!');
}

// ════════════════════════════════════════════════════════════════════════════
// SAVE / LOAD / MANAGE
// ════════════════════════════════════════════════════════════════════════════
async function saveKit() {
  if (!USER) { toast('Login to save kits.', true); window.location.href='../login.html'; return; }
  if (!kitHasItems()) { toast('Add items before saving.', true); return; }
  KIT.name = document.getElementById('kitName').value.trim().replace(/\s+/g,'_').toUpperCase() || 'MY_KIT';
  try {
    const data = {wear:KIT.wear,main:KIT.main,belt:KIT.belt};
    const d = await fetch(`${API()}/api/kitbuilder/kits`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({kit_name:KIT.name,kit_data:data})}).then(r=>r.json());
    if (d.ok) {
      toast(`💾 "${KIT.name}" saved!`);
      loadStats();
    } else { toast(d.error||'Save failed.',true); }
  } catch(e){ toast('Error: '+e.message,true); }
}

async function openLoadModal() {
  MANAGE_MODE = 'load';
  document.getElementById('listModalTitle').textContent = '📂 Load Kit';
  document.getElementById('listModal').style.display = 'flex';
  await fetchKitList();
}

async function openManageModal() {
  MANAGE_MODE = 'manage';
  document.getElementById('listModalTitle').textContent = '🗂️ Manage Kits';
  document.getElementById('listModal').style.display = 'flex';
  await fetchKitList();
}

async function fetchKitList() {
  const body = document.getElementById('listModalBody');
  if (!USER) { body.innerHTML = '<p style="color:var(--text-dim);font-size:.88rem;">Login to save and manage kits. <a href="../login.html" style="color:var(--ember);">Login →</a></p>'; return; }
  body.textContent = 'Loading…';
  try {
    const d = await fetch(`${API()}/api/kitbuilder/kits`,{credentials:'include'}).then(r=>r.json());
    const kits = d.kits||[];
    if (!kits.length) { body.innerHTML='<p style="color:var(--text-dim);font-size:.88rem;">No saved kits yet. Build one and click 💾 Save Kit!</p>'; return; }
    body.innerHTML = kits.map(k=>{
      const date = new Date(k.created_at*1000).toLocaleDateString();
      const isLoad = MANAGE_MODE==='load';
      return `<div class="sk-row">
        <span class="sk-name">🎒 ${esc(k.kit_name)}</span>
        <span class="sk-date">${date}</span>
        ${isLoad?`<button class="btn sm" onclick="loadKit(${k.id})">📂 Load</button>`:
                  `<button class="btn sm danger" onclick="deleteKit(${k.id})">🗑️ Delete</button>`}
      </div>`;
    }).join('');
  } catch(e){ body.innerHTML='<p style="color:#e74c3c;">Error loading kits: '+esc(e.message)+'</p>'; }
}

async function loadKit(id) {
  try {
    const d = await fetch(`${API()}/api/kitbuilder/kits`,{credentials:'include'}).then(r=>r.json());
    const kit = d.kits?.find(k=>k.id===id);
    if (!kit) { toast('Kit not found.',true); return; }
    KIT.wear = (kit.data.wear||[]).map(s=>s?{v:s.v||s.shortname,l:s.l||s.label||s.v||s.shortname,qty:s.qty||1}:null);
    while(KIT.wear.length<7) KIT.wear.push(null);
    KIT.main = (kit.data.main||[]).map(s=>s?{v:s.v||s.shortname,l:s.l||s.label||s.v||s.shortname,qty:s.qty||1}:null);
    while(KIT.main.length<24) KIT.main.push(null);
    KIT.belt = (kit.data.belt||[]).map(s=>s?{v:s.v||s.shortname,l:s.l||s.label||s.v||s.shortname,qty:s.qty||1}:null);
    while(KIT.belt.length<6) KIT.belt.push(null);
    document.getElementById('kitName').value = kit.kit_name;
    renderAllSlots(); updateOutput(); closeModal('listModal');
    toast(`✅ Loaded "${kit.kit_name}"`);
  } catch(e){ toast('Error: '+e.message,true); }
}

async function deleteKit(id) {
  if (!(await openConfirm('Delete Kit?', 'Delete this saved kit? This cannot be undone.', 'Yes, Delete', 'danger'))) return;
  try {
    const d = await fetch(`${API()}/api/kitbuilder/kits/${id}`,{method:'DELETE',credentials:'include'}).then(r=>r.json());
    if (d.ok) { toast('Kit deleted.'); loadStats(); fetchKitList(); }
    else toast(d.error||'Delete failed.',true);
  } catch(e){ toast('Error: '+e.message,true); }
}

function togglePresetPanel() {
  const f = document.getElementById('presetFields');
  const open = f.classList.toggle('show');
  document.getElementById('presetIco').textContent = open ? '✕' : '＋';
}

// ════════════════════════════════════════════════════════════════════════════
// PRESETS SYSTEM
// ════════════════════════════════════════════════════════════════════════════
const PRESET_FILES = [
  { id: "vanilla", label: "Vanilla", path: "/media/kitbuilder/presets/vanilla.json" },
  { id: "2x", label: "2x", path: "/media/kitbuilder/presets/2x.json" },
  { id: "3x", label: "3x", path: "/media/kitbuilder/presets/3x.json" },
  { id: "6x", label: "6x", path: "/media/kitbuilder/presets/6x.json" },
  { id: "supermodded", label: "Super Modded", path: "/media/kitbuilder/presets/supermodded.json" },
];
const _presetCache = new Map();

function setupServerPresets() {
  const select = document.getElementById("presetMultiplierSelect");
  if (!select) return;

  PRESET_FILES.forEach(group => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.label;
    select.appendChild(option);
  });

  select.addEventListener("change", async (e) => {
    const groupId = e.target.value;
    const note = document.getElementById("presetNote");
    const list = document.getElementById("presetBtnList");

    if (!groupId) {
      note.textContent = "Pick a server type to load a built-in loadout.";
      list.innerHTML = "";
      return;
    }

    const meta = PRESET_FILES.find(g => g.id === groupId);
    note.textContent = `Loading ${meta.label} loadouts...`;
    list.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;text-align:center;padding:10px;">Fetching...</div>';

    const kits = await fetchPresetData(meta);
    if (!kits || !kits.length) {
      note.textContent = `No loadouts found for ${meta.label}.`;
      list.innerHTML = "";
      return;
    }

    note.textContent = `${kits.length} ${meta.label} loadouts available.`;
    list.innerHTML = "";

    kits.forEach(kit => {
      const btn = document.createElement("button");
      btn.className = "preset-btn";
      btn.innerHTML = `<strong>${esc(kit.name)}</strong> <span>${kit.items.length} items</span>`;
      btn.onclick = () => loadPresetKit(kit);
      list.appendChild(btn);
    });
  });
}

async function fetchPresetData(meta) {
  if (_presetCache.has(meta.id)) return _presetCache.get(meta.id);
  try {
    const res = await fetch(meta.path, { cache: "no-cache" });
    if (!res.ok) throw new Error("Load failed");
    const data = await res.json();
    const kits = (data.kits || []).map((k, i) => ({
      name: k.name || `Preset ${i+1}`,
      items: (k.items || []).map(item => {
        let slot = String(item.slot || "main").trim().toLowerCase();
        if (slot === "inventory") slot = "main";
        return {
          shortname: String(item.shortname).toLowerCase(),
          quantity: Math.max(1, Number(item.amount) || 1),
          container: slot
        };
      })
    }));
    _presetCache.set(meta.id, kits);
    return kits;
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function loadPresetKit(kit) {
  if (kitHasItems() && !(await openConfirm('Overwrite Kit?', 'This will overwrite your current kit. Continue?', 'Yes, Overwrite', 'danger'))) return;
  
  // Clear slots
  KIT.wear.fill(null); KIT.main.fill(null); KIT.belt.fill(null);
  document.getElementById('kitName').value = kit.name;

  const nextIdx = { wear: 0, main: 0, belt: 0 };
  let placed = 0;

  kit.items.forEach(entry => {
    const pos = entry.container;
    if (!KIT[pos] || nextIdx[pos] >= KIT[pos].length) return;
    if (pos === "wear" && !WEARABLE.has(entry.shortname)) return; // Enforcement

    // Resolve human label for UI
    let label = entry.shortname;
    for (const [, items] of Object.entries(CATS)) {
      const found = items.find(i => i.v === entry.shortname);
      if (found) { label = found.l; break; }
    }
    if (label === entry.shortname) label = toLabel(entry.shortname); // fallback

    KIT[pos][nextIdx[pos]] = { v: entry.shortname, l: label, qty: entry.quantity };
    nextIdx[pos]++;
    placed++;
  });

  renderAllSlots();
  updateOutput();
  toast(`✅ Loaded ${kit.name} (${placed} items)`);
}

// ════════════════════════════════════════════════════════════════════════════
// SCREENSHOT SYSTEM
// ════════════════════════════════════════════════════════════════════════════

[204 more lines in file. Use offset=1003 to continue.]
function openScreenshotModal() {
  if (!kitHasItems()) { toast('Add items to your kit before making a screenshot.', true); return; }
  document.getElementById('screenshotModal').style.display = 'flex';
  generateScreenshotCanvas();
}

async function generateScreenshotCanvas() {
  const status = document.getElementById('ssStatus');
  const img = document.getElementById('ssImg');
  const btnD = document.getElementById('ssDownloadBtn');
  const btnC = document.getElementById('ssCopyBtn');

  status.hidden = false; img.hidden = true; btnD.disabled = true; btnC.disabled = true;
  _activeCanvas = null;

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    const width = 1400;
    const padding = 35;
    const gap = 12;
    const headingHeight = 75;
    const sectionGap = 30;

    const sections = [
      { key: "wear", title: "GEAR", cols: 7, slots: KIT.wear },
      { key: "main", title: "INVENTORY", cols: 6, slots: KIT.main },
      { key: "belt", title: "BELT", cols: 6, slots: KIT.belt }
    ].map(s => ({
      ...s,
      rows: Math.ceil(s.slots.length / s.cols),
      cellSize: Math.floor((width - padding * 2 - gap * (s.cols - 1)) / s.cols)
    }));
    
    const height = padding + sections.reduce((total, sec) => {
      return total + headingHeight + sec.rows * sec.cellSize + (sec.rows - 1) * gap + sectionGap;
    }, 0) - sectionGap + padding;

    canvas.width = width; canvas.height = height;

    // High-End Rust UI Background
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#191a18"); 
    bg.addColorStop(1, "#10100f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle dark overlay behind slots
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(15, 15, width - 30, height - 30);

    let y = padding;
    
    for (const sec of sections) {
      // Draw Header
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
      ctx.font = "900 56px 'Oswald', Impact, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(sec.title, padding, y);
      ctx.restore();
      
      y += headingHeight;

      // Draw Slots
      for (let i = 0; i < sec.slots.length; i++) {
        const col = i % sec.cols;
        const row = Math.floor(i / sec.cols);
        const x = padding + col * (sec.cellSize + gap);
        const cellY = y + row * (sec.cellSize + gap);
        
        await drawScreenshotSlot(ctx, x, cellY, sec.cellSize, sec.slots[i], sec.key);
      }
      y += sec.rows * sec.cellSize + (sec.rows - 1) * gap + sectionGap;
    }

    _activeCanvas = canvas;
    img.src = canvas.toDataURL("image/png");
    img.hidden = false; status.hidden = true;
    btnD.disabled = false; btnC.disabled = false;

  } catch (err) {
    console.error(err);
    status.textContent = "Error building screenshot.";
  }
}

async function drawScreenshotSlot(ctx, x, y, size, itemData, keyType) {
  ctx.save();
  
  // Base Slot Background
  ctx.fillStyle = "rgba(38, 36, 34, 0.95)"; 
  ctx.fillRect(x, y, size, size);
  
  // Inner subtle gradient/shadow
  const slotGrad = ctx.createLinearGradient(x, y, x, y + size);
  slotGrad.addColorStop(0, "rgba(255, 255, 255, 0.05)");
  slotGrad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = slotGrad;
  ctx.fillRect(x, y, size, size);

  // Border based on slot type
  let bColor = "rgba(255, 255, 255, 0.08)"; // default empty
  if (itemData) {
    bColor = keyType === 'wear' ? "rgba(207, 106, 46, 0.6)" : 
             keyType === 'belt' ? "rgba(231, 76, 60, 0.5)" : 
             "rgba(52, 152, 219, 0.4)";
  }
  ctx.strokeStyle = bColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);

  if (itemData) {
    // Condition Bar (Green)
    ctx.fillStyle = "#8cc83d";
    ctx.fillRect(x + 3, y + 3, size - 6, 8);

    // Image
    const image = await loadCanvasImage(`/media/kitbuilder/${itemData.v}.png`);
    if (image) {
      const imageMax = size * 0.72;
      const imageRatio = image.naturalWidth / image.naturalHeight;
      let drawWidth = imageMax, drawHeight = imageMax;
      
      if (imageRatio > 1) drawHeight = drawWidth / imageRatio;
      else drawWidth = drawHeight * imageRatio;
      
      const imageX = x + (size - drawWidth) / 2;
      const imageY = y + 12 + (size * 0.8 - drawHeight) / 2;
      
      // Crisp drop shadow for the item
      ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
      ctx.shadowBlur = 12; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 6;
      ctx.drawImage(image, imageX, imageY, drawWidth, drawHeight);
      ctx.shadowColor = "transparent"; // reset
    }

    // Text
    const text = `x${fmtNum(itemData.qty)}`;
    let fontSize = Math.max(20, Math.floor(size * 0.22));
    ctx.font = `800 ${fontSize}px 'Arial', sans-serif`;
    
    ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)"; 
    ctx.fillStyle = "#ffffff";
    
    ctx.strokeText(text, x + size - 8, y + size - 6);
    ctx.fillText(text, x + size - 8, y + size - 6);
  }
  ctx.restore();
}

function loadCanvasImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "Anonymous"; // Prevents Canvas taint issues
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function downloadScreenshotImage() {
  if (!_activeCanvas) return;
  _activeCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const name = document.getElementById('kitName').value || 'custom-kit';
    link.download = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-screenshot.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('💾 Image downloaded!');
  }, "image/png");
}

async function copyScreenshotImage() {
  if (!_activeCanvas) return;
  if (!navigator.clipboard || !window.ClipboardItem) {
    toast("Image copy not supported in this browser. Use Download.", true); return;
  }
  _activeCanvas.toBlob(async (blob) => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("📋 Image copied to clipboard!");
    } catch (err) {
      console.error(err);
      toast("Failed to copy image.", true);
    }
  }, "image/png");
}

init();
