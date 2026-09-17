# Prod Migration — Runbook & Issue Log

> **Status:** ✅ **PROD PE HO CHUKI — 17 Sep 2026, 20:02–20:15 UTC.**
> Poora record §13 me hai. Runbook aage ke reference ke liye rakha gaya hai.
> **Last updated:** 2026-09-17
> **Scripts:** `server/scripts/`

Ye doc teen cheezein rakhta hai:
1. **Jo issues rehearsal me mile** — taaki prod pe dobara na hon (§1)
2. **Migration ka step-by-step runbook** — §3
3. **Prod pe asli me jo hua** — §13 (timeline, ek galti jo hui, aur sabak)

---

## 1. Rehearsal me mile issues — sab fix ho chuke

Ye saare **asli bugs** the jo sirf prod ka clone chala ke hi pakde gaye. Static
tests inhe kabhi na pakadte.

### 🔴 1.1 Dobara chalane pe vendor ke branches corrupt ho jaate

```
RUN 2:  WRITE 8  Location → type=CUSTOMER
```
Wo 8 **vendor ke branches** the. Pehle run me `isProductAddress` unset ho jata
hai, to doosre run ka filter unhe bhi pakad leta tha → branches customer
address ban jaate → **har order `503 VENDOR_PICKUP_MISSING`**, poora platform band.

**Fix:** filter ab `type` pe hai (`$nin: [CUSTOMER, VENDOR_BRANCH]`), `isProductAddress` pe nahi.

### 🔴 1.2 `orders.orderNumber` ka unique index chup-chaap fail hota tha

Prod me `autoIndex` ne pehle hi **non-unique** `orderNumber_1` bana rakha tha.
Migration ka unique index `IndexOptionsConflict` deta aur catch use warning
bana ke aage badh jata — **unique index banta hi nahi**. Baad me duplicate
order numbers ban sakte the.

**Fix:** migration pehle conflicting index drop karti hai, phir unique banati hai. Schema me bhi `unique: true` declare kiya.

### 🔴 1.3 Mongoose `strict` mode ne 3 `$unset` chup-chaap nigal liye

Jo field schema se hata di jaye, Mongoose usse update object se **drop kar
deta hai** — `$unset` chalta hi nahi. Isse teen cheezein kabhi unset nahi hoti thi:
- `Setting.delivery.distanceFactor` / `weightFactor`
- `Location.isProductAddress` / `isVendorAddress` (verify check ne pakda: 143 bache the)

**Fix:** in updates pe `{ strict: false }`.

### 🔴 1.4 `productlocations` drop ke baad wapas aa jati thi

Mongoose `autoIndex` har connect pe model register karke collection dobara
bana deta hai. Migration drop karti, phir autoIndex race me recreate kar deta.

**Fix:** migration `ProductLocation` model require hi nahi karti — raw
collection se padhti hai. Model + service + controller files delete kar diye
(git history me hain).

### 🔴 1.5 `orderNumber` collision — migration vs runtime counter

Migration `NVS-2606-000001` se numbers deti, aur runtime `Counter` collection
0 se shuru hota. Same mahine me takra jaate.

**Fix:** migration counters seed karti hai (`order:2606 → 26`, `2607 → 31`, `2608 → 16`, `2609 → 3`).

### 🟠 1.6 Khali carts me stale totals

Prod me aise carts hain: `items: [], totalWeight: 26, totalQuantity: 1` —
purane `removeItem` bug se. Migration ka filter sirf `items` wale carts
pakadta tha.

**Fix:** ab **saare** unpurchased carts normalize hote hain.

### 🟠 1.7 76 orders me `productSnapshot` tha hi nahi

Frontend ko bola gaya hai *"order history me `productSnapshot` use karo"* — par
migration usse backfill nahi karti thi. Vendor panel me purane orders me
**product ka naam blank** aata.

**Fix:** backfill (28 products sab maujood hain).
**Caveat:** purane orders ka snapshot **aaj ke** product data se bhara hai —
order ke waqt ka naam kahin store hi nahi hua tha. `price` asli historical hi hai.

### 🟠 1.8 49 DELIVERED orders me `deliveredAt` nahi tha

**Fix:** `deliveredAt = updatedAt` backfill.

### 🟠 1.9 `verifyPayment` abhi bhi `ProductLocation` pe stock ghata raha tha

Dormant code, par model delete karne pe crash hota. Saath me do aur purane
bugs: `status = "PAID"` (enum me hai hi nahi) aur `razorpaySignature`
(undefined variable → ReferenceError).

**Fix:** ab `Product` pe stock, sahi enum, sahi variable.

### 🟡 1.10 Prod pe naya code pehle hi chal chuka hai

`vendorprofiles`, `vendorserviceareas`, `counters` — teeno collections prod me
**ban chuki hain** (0 docs, par naye indexes ke saath). `locations` pe 6
indexes hain (pehle 2 the).

⚠️ **Iska matlab:** agar koi server naye code ke saath prod pe live hai, to
customers ko abhi `404 PINCODE_NOT_SERVICEABLE` mil raha hoga — service areas
hain hi nahi. **Migration se pehle confirm karein.**

### 🟠 1.11 Duplicate addresses — `create` ke paas upsert tha hi nahi

Stage data me ek customer ke **8 address** mile, jinme **6 bilkul identical**,
sab **20 minute ke andar** bane:

```
👤 9741114222 — sab zip 577004
  1.          sadananda g       vinobha nagar               07:19
  2-7.        yallamma nagar    near amrutha mai school     07:25 → 07:36  ← 6 identical
  8. ⭐DEFAULT sadananda g       yallamma nagar              07:39
```

User baar-baar "Save" daba raha tha, aur `POST /locations/create` har baar
naya doc bana raha tha. Poore stage data me **2 aise groups, 6 barbaad docs**.

**Fix:** naya `PUT /locations/upsert` — customer ka default address ho to
update karta hai, na ho to banata hai. Dobara-dobara Save karne se ab
duplicate nahi bante. Purane duplicates `backfillTextCase.js` soft-delete
kar deti hai (§10).

---

## 2. Data mismatch se bachne ke liye jo verify hota hai

Migration ke andar **13 automatic checks** hain. Ek bhi fail ho to output me
`❌` dikhega:

```
✅ products with null userId             0
✅ categories with null userId           0
✅ subcategories with null userId        0
✅ locations with null type              0
✅ vendor default branches               1
✅ service areas                         6
✅ orders without vendorId               0
✅ orders without deliveryPincode        0
✅ non-empty unpurchased carts           0
✅ orders without productSnapshot        0
✅ DELIVERED orders without deliveredAt  0
✅ items[].vendorId bacha hua            0
✅ locations with isProductAddress       0
```

Aur alag se **`verify-generic-shape.js`** purana (migrated) aur naya doc ka
**field-by-field diff** karta hai:

```
ORDERS
 purana : assignedAt, assignedTo, cartId, deliveredAt, deliveryCharge,
          deliveryPincode, distanceKm, items, locationId, orderNumber,
          payableAmount, paymentMethod, paymentStatus, status,
          statusHistory, subTotal, userId, vendorId, vendorLocationId
 naya   : ...bilkul wahi 19 fields...                              ✅

 item purana : price, productId, productSnapshot, quantity
 item naya   : price, productId, productSnapshot, quantity          ✅
```

---

## 3. Prod migration — step by step

> ⏱️ **Maintenance window chahiye — 15 min.** "App aur backend saath deploy"
> se kaam nahi chalega, kyunki dono order me kuch na kuch toot ta hai:
>
> | | |
> |---|---|
> | Code pehle, migration baad me | Listing sabko `404` — service areas nahi hain |
> | Migration pehle, code baad me | Purana `verifyCartByPincode` `isProductAddress` dhoondhta hai, jo unset ho chuka → **checkout sabka fail** |

### Step 0 — Pehle ye confirm karein
- [ ] Koi server naye code ke saath prod pe live to nahi? (§1.10)
- [ ] `DISABLE_PUSH` prod pe **set NAHI** hona chahiye (sirf stage pe)
- [ ] Vendor ko bata diya ki delivery charge `isEnabled: false` hai — toggle on wahi karega

### Step 1 — Backup (skip mat karna)
```bash
mongodump --uri "<prod-uri>" --out ./dump-$(date +%Y%m%d-%H%M)
```
Migration **reversible nahi hai**: `isProductAddress` unset, `Setting` fields
drop, carts clear, `productlocations` drop. Wapas jaane ka ek hi rasta —
`mongorestore`.

### Step 2 — App band karein (maintenance mode)

> 🔑 **"Code deploy" ke DO matlab hain, aur dono ka waqt alag hai:**
> ```
> FILES disk pe   →  migration se PEHLE   (migration scripts hi naye code me hain)
> PROCESS start   →  migration ke BAAD    (warna naya code khali DB pe chalega)
> ```
> Yaani `git pull` pehle, `pm2 start` baad me.

> 🔴 **Server pe DO apps chal rahi hain** — `nvsricemart` (id 0) aur
> `IFTV-OTT` (id 1). **`pm2 stop all` KABHI mat chalana** — wo doosri app
> bhi band kar dega. Hamesha naam se:

```bash
pm2 list                        # dono dikhengi
pm2 stop nvsricemart            # ⚠️ sirf yahi, `all` nahi
pm2 status                      # nvsricemart 'stopped', IFTV-OTT 'online'

# confirm — API band ho gayi
curl -i https://api.nvsricemart.com/nvs-rice-mart/categories/getAll
```

`pm2 stop` ke baad wo khud restart nahi hoga. **Window ke beech me server reboot
mat karna** — `pm2 startup` laga ho to wo wapas chalu ho jayega.

Aur nginx me maintenance 503 laga do, taaki app ko 502 ka HTML na mile:

```nginx
location /nvs-rice-mart/ { return 503; }
error_page 503 @maintenance;
location @maintenance {
    default_type application/json;
    return 503 '{"success":false,"message":"Hum abhi update kar rahe hain. 20 minute me wapas."}';
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

⚠️ **Apni dev machine ka `.env` bhi check karo** — kisi aur jagah se prod URI
connected na ho. Prod live hai: 17 Sep ke audit ke beech me hi ek naya user
register ho gaya tha (1460 → 1461).

### Step 3 — Dry run
```bash
MONGO_URL="<prod-uri>" node scripts/migrateToVendorModel.js
```
Numbers check karein — **17 Sep ke prod clone pe ye aaye the**:
```
collection            INSERT  UPDATE   UNSET    DROP
users                      1     103
vendorprofiles             1
vendorserviceareas         6                          (577001-577006)
counters                   4                          (2606/07/08/09)
locations                        257     147
categories                        17
subcategories                     25
products                         109
carts                            301
orders                            82
settings                           1
productlocations                                  521  ← poori collection
```

Prod live hai, isliye orders/users badhte rehte hain — ye numbers thode
upar-neeche ho sakte hain. **Shape same hona chahiye**, exact count nahi.
Kuch bilkul alag dikhe (jaise `locations` me 0, ya `productlocations` me 0)
to rukein.

### Step 4 — Apply
```bash
MONGO_URL="<prod-uri>" node scripts/migrateToVendorModel.js --apply
```
Aakhir me **21/21 verify checks pass** hone chahiye — 13 data + 8 index.
Ek bhi `❌` aaye to **rukein**, aage mat badhein.

```
✅ 13 data checks
✅ index users.email_1_role_1              UNIQUE
✅ index users.mobile_1_role_1             UNIQUE
✅ index categories.userId_1_name_1        UNIQUE
✅ index subcategories.categoryId_1_name_1 UNIQUE
✅ index products.userId_1_SKU_1           UNIQUE
✅ index orders.orderNumber_1              UNIQUE
✅ bogus locations.location_2dsphere       drop ho gaya
✅ bogus locations.geo_2dsphere            drop ho gaya
```

> Index checks §1.2 wale bug ke liye hain — pehle `createIndex` call to hoti
> thi par natija check nahi hota tha, aur unique index chup-chaap banta hi
> nahi tha.

### Step 4.5 — Text casing backfill (§10)

⚠️ Ye **naya code deploy karne se pehle** chalayein — taaki purana data aur
naya data ek hi standard pe hon.

```bash
# 1. DRY RUN — kya-kya badlega dekh lein
MONGO_URL="<prod-uri>" node scripts/backfillTextCase.js --rebuild-formatted

# 2. Theek lage to apply (prod pe --yes-prod bhi zaroori hai)
MONGO_URL="<prod-uri>" node scripts/backfillTextCase.js --rebuild-formatted --apply --yes-prod

# 3. Dobara dry run → "0 docs badlenge" aana chahiye
MONGO_URL="<prod-uri>" node scripts/backfillTextCase.js --rebuild-formatted
```

Stage pe ye numbers aaye the:
```
casing            456 docs (1954 fields)
formattedAddress  124 docs
dedupe              2 groups, 6 docs soft-delete
```

Script `scripts/.backfill-undo-*.json` banati hai — usse poora DB restore
kiye bina **bilkul wahi** changes wapas ho jate hain:
```bash
MONGO_URL="<prod-uri>" node scripts/backfillTextCase.js --undo=scripts/.backfill-undo-....json
```

### Step 5 — Process start karein

Files pehle hi disk pe hain (Step 2 se pehle `git pull` ho chuka — **`npm install` ki zaroorat nahi**, neeche §12 dekho).
Ab bas process chalu:

```bash
pm2 restart nvsricemart --update-env
pm2 logs --lines 50        # "MongoDb connection established" dikhna chahiye
```

Phir nginx ka maintenance block hatao aur `nginx -t && systemctl reload nginx`.

### Step 6 — Verify
```bash
MONGO_URL="<prod-uri>" node scripts/verify-generic-shape.js   # read-only
MONGO_URL="<prod-uri>" node scripts/prodAudit.js              # read-only
```

`prodAudit` ab **`STATE: MIGRATED`** dikhayega aur customers ka breakdown
migration se pehle wale projection se match karna chahiye.

> ⚠️ **`postMigrationSmoke.js` prod pe chalti hi nahi** — hard abort hai, aur
> wo ek asli order banati hai. Uski jagah prod ka clone bana ke usi pe
> chalao — prod ko zero risk, poore 75 checks:
> ```bash
> node scripts/cloneDbForRehearsal.js --from NvsRiceMart-ProdDB >      --to NvsRiceMart-PostCheck --apply
> MONGO_URL="<...PostCheck>" DISABLE_PUSH=true node scripts/postMigrationSmoke.js
> ```

Aur manually:
- [ ] Vendor login (`nagraj@gmail.com`) → 76 orders, 30 products dikhein
- [ ] Ek serviceable pincode ka customer → 15 categories dikhein
- [ ] Ek order place karke `PENDING → DELIVERED` chalayein

### Step 7 — App band se chalu karein

### Rollback (agar kuch bigde)

```bash
pm2 stop nvsricemart
mongorestore --uri "<prod-uri>" --drop ./dump-YYYYMMDD-HHMM
cd /root/NVS-Rice-Mart && git checkout 871d45f
pm2 restart nvsricemart
```

⚠️ **`cloneDbForRehearsal.js` se rollback NAHI hota** — wo target me "prod"
dekh ke refuse kar deti hai (jaan-boojh ke). Clone sirf forward copy ke liye
hai. **Isliye `mongodump` wala backup skip mat karna** — wahi ek rasta hai
wapas jaane ka.

Sirf casing wapas karni ho (migration rakhni ho) to:
```bash
node scripts/backfillTextCase.js --undo=scripts/.backfill-undo-....json
```

---

## 4. Migration exactly kya karti hai

```
users              +1 Nagraj Mart · 96 customers ko locationId · 3 blocker cleanup
vendorprofiles     +1  delivery values bhari, isEnabled:false → charge ₹0
vendorserviceareas +6  577001-577006
counters           +4  order:2606/07/08/09 (orderNumber collision se bachne ko)

locations          type · userId · isDefault · 577006 coord fix
                   $unset isProductAddress, isVendorAddress
categories         userId
subcategories      userId
products           userId · bell ₹950→₹1100 · 21 products ka stock (PL ka min)
carts              clear (items=[], totals=0, verifiedAt=null)
orders             vendorId · vendorLocationId · orderNumber · deliveryPincode
                   statusHistory · deliveredAt · assignedTo/At · productSnapshot
settings           10 dead fields unset · maxAllowedDeliveryCharge=200
productlocations   DROP (521 rows — dump me safe)

indexes            DROP: location_2dsphere, geo_2dsphere, orders.orderNumber_1
                   CREATE: 6 unique + schema ke saare non-unique

KUCH DELETE NAHI — na user, na order, na address, na product.
```

### 3 blockers jo migration khud handle karti hai
| | |
|---|---|
| `6a1e620e…245b` | Test account jiske paas vendor ka mobile `8210574144` tha (0 orders) → soft-delete |
| `6a943efb…779` / `…77a` | Double-submit se bane duplicate users, mobile `8088684570` (dono khali) → soft-delete |

---

## 5. Stage environment (abhi live hai)

`NvsRiceMart-StageDB` = **prod ka exact clone, migrated**. Frontend isi pe test kare.

```
DISABLE_PUSH=true          ← ZAROORI. 1453 asli customers ke FCM tokens hain
```

| Role | Login | Password | Kya test hoga |
|---|---|---|---|
| admin | `ricemartnvs@gmail.com` | `Admin@123` | admin panel |
| vendor | `nagraj@gmail.com` | `nagraj@123` | vendor panel |
| customer | `9886061450` | `Stage@123` | **577001** → 15 categories, 30 products |
| customer | `9620508145` | `Stage@123` | **500774** → `404 PINCODE_NOT_SERVICEABLE` |
| customer | `8660222341` | `Stage@123` | koi address nahi → `400 PINCODE_REQUIRED` |

Login: `POST /auth/login`
```jsonc
{ "type": "email",  "email": "…",  "password": "…", "role": "admin" }
{ "type": "mobile", "mobile": "…", "password": "…", "role": "user" }
```

**Stage theek hai ya nahi — kabhi bhi check karein:**
```bash
MONGO_URL="<stage>" DISABLE_PUSH=true node scripts/stageLoginCheck.js
```

---

## 6. Saare scripts

| Script | Kya karta hai |
|---|---|
| `verify-all.js` | 368 static checks (koi DB nahi) |
| `migrateToVendorModel.js` | Migration — **dry run default**, `--apply` se writes, idempotent |
| `cloneDbForRehearsal.js` | `--from X --to Y` — prod se sirf READ, naye DB me clone |
| `seedStageAccounts.js` | Stage ke test logins (naye user nahi banata, password reset karta hai) |
| `postMigrationSmoke.js` | 75 checks — asli migrated data pe poora flow |
| `e2e-flow-test.js` | 145 checks — apna data banake login se delivery tak, cleanup ke saath |
| `verify-generic-shape.js` | 30 checks — purana vs naya doc ka field-by-field diff |
| `stageLoginCheck.js` | Stage health — logins + teeno customer states |
| `repairVendorProfiles.js` | Orphan vendor users (User hai, VendorProfile nahi) theek karta hai |
| `cleanupLegacyArtifacts.js` | Purane code ke nishaan hatata hai — **dry run default**, `--apply` se writes, idempotent (neeche §9) |
| `backfillTextCase.js` | 🆕 Purane data ki casing theek + duplicate addresses saaf — **dry run default**, `--apply`, `--undo=<file>`, idempotent (§10) |
| `locationAudit.js` | 🆕 Address data ka READ-ONLY audit — multi-address users, default status, casing scope, orphans |
| `verify-textCase.js` | 🆕 128 checks — casing rules (koi DB nahi) |
| `verify-locations.js` | 🆕 51 checks — create/upsert validator + formattedAddress builder (koi DB nahi) |
| `verify-locations-live.js` | 🆕 78 checks — upsert ka asli DB pe test (apna scratch data banata aur mitata hai) |
| `verify-catalog-live.js` | 🆕 29 checks — category/product casing + case-insensitive duplicate detection |

### Rehearsal dobara karni ho
```bash
node scripts/cloneDbForRehearsal.js --from NvsRiceMart-ProdDB --to NvsRiceMart-Rehearsal --apply
MONGO_URL="<rehearsal>" node scripts/migrateToVendorModel.js --apply
MONGO_URL="<rehearsal>" node scripts/verify-generic-shape.js
```

---

## 7. Verification summary

```
static suite (no DB)            368 pass
post-migration smoke             75 pass   ← asli migrated prod data
e2e flow                        145 pass   ← real HTTP, login se delivery tak
generic shape (purana vs naya)   30 pass   ← field-by-field diff
stage health                     11 pass   ← seeded logins + 3 states
                                ─────────
                                629 pass, 0 fail
```

Migration **do baar** chalayi — doosre run me sirf index lines, **zero data write**.

---

## 8. Abhi bhi open

| # | Cheez | Kab |
|---|---|---|
| 1 | ~~Koi server prod pe live to nahi?~~ ✅ **Ho gaya** — 17 Sep ko `pm2 stop nvsricemart` karke, aur `curl` se confirm karke migration chalayi. Prod pe migration ke baad `cleanupLegacyArtifacts` ne **0 changes** dikhaye, yaani koi purana process beech me nahi likh raha tha | ✅ done |
| 2 | **Force-update mechanism** — app store rollout sabke phone pe turant nahi pahunchta. Purane app version wale naye backend pe tootenge. Backend `minAppVersion` return kare aur app "update karein" dikhaye | Prod deploy se pehle |
| 3 | **1357 customers (93.1%)** ko ab `PINCODE_REQUIRED` mil raha hai — ye 17 Sep ke prod ka asli aankda hai. Backend ready hai (`PUT /locations/upsert`), par purane app installs wale tab tak tootenge jab tak update na karein | 🔴 **ab live hai** |
| 4 | **12 customers** service area ke bahar — unhe `404 PINCODE_NOT_SERVICEABLE` mil raha hai, "coming soon" screen chahiye | 🔴 **ab live hai** |
| 5 | Order `PENDING` me atka rahe to auto-cancel job (Q20 — abhi "rehne do" tay hua) | Phase 6 |
| 6 | `productlocations` (521 rows) ab sirf backup me hai — `/root/backup-20260917-2003` aur `NvsRiceMart-Backup-17Sep`. 1-2 mahine baad prices confirm ho jayein to archive kar dena | Baad me |
| 7 | `server/.env` **git me commit hota hai** — saare secrets repo me hain. `.gitignore` + keys rotate | Backend |
| 8 | `package-lock.json` hai hi nahi — isi wajah se `npm ci` nahi chala. Add karna chahiye | Backend |

---

## 9. Stage pe purana code chal pada tha — kya hua, kya seekha

**14 Sep 2026** ko Postman collection banate waqt StageDB me ye mila:

| Nishaan | Kaun bana sakta hai |
|---|---|
| Ek location doc me `isProductAddress: false` **aur `type` field hai hi nahi** | Sirf **purana code** — naye schema me `isProductAddress` hai hi nahi (mongoose `strict` use drop kar deta) aur naya code har address pe `type` set karta hai |
| `productlocations` collection **wapas aa gayi** (0 docs) | Sirf **purana code** — naye code me model file delete ho chuki hai, `autoIndex` use bana hi nahi sakta |
| `location_2dsphere` index **wapas aa gaya** | Sirf **purana code** — naye schema me `location` naam ka field hai hi nahi |

Teeno cheezein migration ke baad **drop ho chuki thi** (`postMigrationSmoke` tab 75/75 pass tha).
Dobara aa jana matlab: beech me koi server **purane build** ke saath usi DB se connect hua.

### Kyun khatarnak hai

1. Jis address pe `type` nahi hai, wo naye code ke liye na customer address hai na vendor branch —
   us customer ka **catalog resolve hi nahi hoga**.
2. Purana code `isDefault` set hi nahi karta tha, isliye us customer ko `400 PINCODE_REQUIRED`
   milta rahega chahe address save ho.
3. `autoIndex` har connect pe dobara `productlocations` aur `location_2dsphere` bana dega —
   yaani ek baar saaf karke chhod dena kaafi nahi, **purana server band karna hi padega**.

### Prod migration pe iska matlab

> Maintenance window me **ye confirm karna sabse pehla step hai** ki prod DB pe
> koi bhi purana ya naya process connected nahi hai — sirf app band karna kaafi nahi,
> purana deployment/instance bhi band hona chahiye. Warna migration ke beech me hi
> naye artifacts ban jayenge.

Migration ke **baad** ek baar ye chala lena (sab kuch saaf hai ye confirm karne ke liye):

```bash
node scripts/cleanupLegacyArtifacts.js            # DRY RUN — "0 changes" aana chahiye
node scripts/cleanupLegacyArtifacts.js --apply    # kuch mile to
```

Script ye karti hai (idempotent, dry-run default):

1. `productlocations` drop — **sirf tab jab khaali ho**; data mila to chhod deti hai aur bata deti hai
2. `location_2dsphere` index drop
3. `isProductAddress` / `isVendorAddress` fields unset
4. Bina `type` wale locations ko sahi type — userId ka role `vendor` ho to `VENDOR_BRANCH`, warna `CUSTOMER`
5. Jis customer ke address hain par koi `isDefault` nahi, uske sabse purane address ko default bana deti hai

### Stage pe kya kiya gaya

```
  1  productlocations drop (khaali thi)
  1  location_2dsphere drop
  1  locations.isProductAddress unset
  1  type = CUSTOMER set
  1  default address promote
  ─────
  5 changes  →  dobara dry run: 0 changes
```

Uske baad: `postMigrationSmoke` **75/75 pass** (pehle 72/75), `stageLoginCheck` **11/11 pass**.

---

## 10. Text casing change — lowercase se proper case

**16 Sep 2026.** Pehle har service `.toLowerCase()` karke save karti thi.
`"Davangere"` DB me `"davangere"` ban jata tha aur wahi customer ko wapas
dikhta tha. Ab display fields **jaise dikhne chahiye waise** save hote hain.

### Kya badla

| | |
|---|---|
| **Title Case** | Location ke `name` `shopOrBuildingNumber` `address` `area` `city` `district` `state` `country` `formattedAddress` · User `name` · Category/SubCategory `name` · Product `name` `brand` · Banner `name` · Terms/Privacy `title` · ServiceArea `city` `district` `state` `country` · Vendor `shopName` `legalName` |
| **Sentence Case** | har jagah `description` |
| 🔒 **Chhua NAHI** | `email` · `role` · `loginType` · `product.type` · `zipcode` · `SKU` |

### Kyun kuch fields nahi chhue

- **`email`** — `findOne({ email })` **exact match** karta hai. Lowercase
  hatate to `Foo@x.com` se banaya account `foo@x.com` se login hi na kar
  pata, aur partial-unique index duplicate accounts nahi rok pata.
- **`role` / `loginType` / `product.type`** — ye **enum** hain. Yahan
  lowercase karna *normalization* hai, cosmetic nahi. Hata dete to client
  ka `"GROCERY"` mongoose enum validation me fail ho jata.

### Casing rules — `server/utils/textCase.js`

```
toTitleCase()      naam / jagah
toSentenceCase()   description
normalizeForCompare()  sirf compare ke liye (kabhi save nahi hota)
ciExact()          case-insensitive exact match, regex-escaped
```

🔑 **Sabse zaroori rule:** user ne jo **mixed case** type kiya, use chheda
nahi jata — `"NVS Rice Mart"`, `"iPhone 15"`, `"McDonald's"` waise hi
rehte hain. Auto-casing lossy hai, isliye jahan user ne deliberately
casing di hai wahan usko maana jata hai.

```
"davangere"          → "Davangere"
"MADHYA PRADESH"     → "Madhya Pradesh"
"mp"                 → "MP"          (state/UT dictionary)
"rnr raw rice"       → "RNR Raw Rice" (KNOWN_ACRONYMS list)
"17 th cross"        → "17 Th Cross"  ("th" acronym NAHI hai)
"ಕರ್ನಾಟಕ"             → unchanged     (Kannada me case hota hi nahi)
"NVS Rice Mart"      → unchanged      (mixed = user ka faisla)
```

> ⚠️ **`KNOWN_ACRONYMS` explicit list hai, heuristic nahi.** "vowel nahi
> to acronym" wala rule is data pe toot jata tha — `th`/`nd`/`rd`/`st`
> **69 baar** aate hain (ordinal suffix) aur `hhhhg`/`dfsdf` jaisa junk bhi
> uppercase ho jata. Naya acronym add karna ho to `textCase.js` me likh dein.

### Filters case-insensitive ho gaye — ye COMPULSORY tha

`getAllLocations` ke `city`/`district`/`state`/`country` filters query value
ko lowercase karke **exact match** karte the. Wo sirf isliye chalta tha ki
DB me sab lowercase tha. Ab `ciExact()` lagta hai — warna `?city=Indore`
pe **0 results** aate.

Wahi duplicate-checks pe: `findOne({ name })` ab `ciExact(name)` use karta
hai, warna `"Rice"` aur `"rice"` do alag category ban jate.

`zipcode` pe jaan-boojh ke **plain exact match** rakha — digits hai, aur
regex `{ zipcode: 1, isDeleted: 1 }` index ko bekaar kar deta.

### 🔒 Saath me 33 ReDoS call sites theek hue

Har `getAll` me user ka input **seedha** `new RegExp()` me jata tha.
`?search=(a+)+$` bhej ke koi server hang kar sakta tha. Ab sab
`escapeRegex()` se guzarta hai — 9 files, 33 jagah.

### Rollback

```bash
# sirf casing changes wapas (poora DB restore kiye bina)
node scripts/backfillTextCase.js --undo=scripts/.backfill-undo-....json

# ya poora DB
node scripts/cloneDbForRehearsal.js --from <backup-db> --to <target-db> --apply
```

Code wapas karna ho to `utils/textCase.js` ke helpers ko identity function
bana dena kaafi nahi — services `toTitleCase()` call karti hain, wo purane
`.toLowerCase()` pe wapas laani padengi (git history me hain).

### Stage pe result

```
backup            NvsRiceMart-StageBackup   2270/2270 docs
casing            456 docs (1954 fields)
formattedAddress  124 docs
dedupe              2 groups, 6 docs soft-delete
dobara dry run    0 changes ✅ idempotent

verify-all 368 · textCase 128 · locations 51 · locations-live 78 · catalog-live 29
stageLoginCheck 11/11
```

---

## 11. Prod rehearsal — 17 Sep 2026 (aaj ke prod data pe)

Prod ka **aaj ka** clone bana ke poori migration chain chalayi gayi.
Ye wo numbers hain jinpe prod run ko match karna chahiye.

### Prod ki position (migration se pehle)

```
users            1461     customer 1459 · vendor 0 · admin 1
locations         147     8 vendor branch · 139 customer · 0 pe `type`
categories         17     15 active  · userId 0/17
subcategories      25     20 active  · userId 0/25
products           90     30 active  · userId 0/90
orders             82     52 DELIVERED · 30 CANCELLED · 0 PENDING
carts             383     82 purchased · 301 unpurchased (219 me items)
productlocations  521
vendorprofiles/vendorserviceareas/counters   0 (khali bani hui)

DB size          0.87 MB · 2731 objects
```

### Customers pe asar

| Kitne | % | Kya milega |
|---|---|---|
| 88 | 6.0% | catalog `200` ✅ |
| 13 | 0.9% | `404 PINCODE_NOT_SERVICEABLE` |
| 1355 | 93.1% | `400 PINCODE_REQUIRED` → address screen |
| 219 | — | cart clear hoga, dobara add karna padega |

Bahar wale pincodes: 577008(3) · 577601(2) · 577007(2) · 834008 · 500774 · 94043

### Vendor ko batane wali cheezein

- `bell` ₹950 → **₹1100** *(confirm ho chuka)*
- **18 products ka stock kam hoga** (ProductLocation ka minimum liya jata hai):
  `bell 597→500` · `hamsa 623→512` · `bhanu 522→506` · `keerthi broken rice 515→504` ·
  `nl ghee rice 508→498` · `mm rice 534→529` · `mbp 504→500` · `kv gold 504→501` ·
  `krishnaveni 504→502` · `india gate wada kolam 505→502` · `keerthi 505→502` ·
  `mb jeera raw rice 500→497` · `nl jeera steam rice 5009→5004` · `afreen 502→500` ·
  `al jeera raw rice 516→515` · `black bullet 643→642` · `royal bullet 566→565` ·
  `guruji 135→133`
- Delivery charge `isEnabled: false` rahega → charge ₹0. Toggle vendor khud karega.

### Rehearsal ka result

```
clone (prod → Rehearsal2)          2731/2731 docs, counts match
dry run ke baad DB badla?          ZERO DIFF          ← autoIndex:false ka proof
migration apply                    21/21  (13 data + 8 index)
backfillTextCase apply             534 docs / 1924 fields + 6 address soft-delete
backfillTextCase dobara            0 changes          ← idempotent
cleanupLegacyArtifacts             0 changes
postMigrationSmoke                 75/75
verify-generic-shape               31/31
verify-all (static)               368/368
verify-textCase / verify-locations 128 / 51
                                  ──────────────────
                                   674 checks, 0 fail
```

Saath me asli `index.js` se server boot karke bhi test kiya (rehearsal DB pe):
root `200` · vendor login ✅ · `/orders/vendor/summary` ✅ · `/products/getAll`
30 products, naam ab Title Case me (`Guruji`).

### 🔴 Dry run pehle DB me likhta tha — ab nahi

Mongoose default me har model ke schema-indexes **connect hote hi** bana deta
hai. Matlab **dry run bhi write karta tha** — prod pe `vendorprofiles`,
`vendorserviceareas`, `counters` isi wajah se khali bani hui mili (§1.10).

Ab `migrateToVendorModel.js` `{ autoIndex: false }` se connect karti hai.
Saare indexes STEP 10 me jaan-boojh ke bante hain (`createIndexes()` autoIndex
se alag cheez hai), isliye kuch chhootta nahi.

**Proof:** clone ka collections+counts+indexes fingerprint dry run se pehle
aur baad me bilkul same.

### Abhi bhi khula

| # | Cheez |
|---|---|
| 1 | **Purane app installs** — force-update (`minAppVersion`) abhi nahi hai. Naya build ready hai; jo update nahi karenge wo naye backend pe tootenge |
| 2 | **`mongodump` server pe hai ya nahi** — rollback ka ekmatra rasta wahi hai |
| 3 | **Atlas IP allowlist** me Hostinger ka IP |
| 4 | Server ka **Node version** (`package.json` me `engines` declared nahi hai) |
| 5 | `app.use(cors())` sab origins allow karta hai — kaam karega, par baad me allowlist behtar |

---

## 12. Prod server — verified facts (17 Sep 2026)

SSH se khud check kiya gaya. **Kuch band nahi kiya, kuch badla nahi** — sirf
`mongodump`/`mongorestore` install kiye (additive, koi service nahi chhui).

```
host            72.62.226.17   (srv1371564)   root
OS              Ubuntu 24.04.4 LTS  x86_64
Node            v20.20.0        npm 11.18.0
git             2.43.0          remote access ✅
nginx           1.24.0          api.nvsricemart.com → localhost:8000 (Certbot SSL)
disk            48G, 7% used
RAM             3.9 GB, 3.2 GB available
repo            /root/NVS-Rice-Mart   branch `main`   commit 871d45f
.env            → NvsRiceMart-ProdDB · PORT=8000 · ENABLE_NGROK=false
                  DISABLE_PUSH set NAHI hai  ← prod pe yahi sahi hai
firebase key    /root/NVS-Rice-Mart/server/firebaseServiceKeys.json ✅
mongodump       100.13.0  (17 Sep ko install kiya)
```

### 🔴 Teen cheezein jo plan badalti hain

**1. Server pe DO apps hain — `pm2 stop all` mat chalana**

```
id 0  nvsricemart    ← ye band karni hai
id 1  IFTV-OTT       ← ise haath mat lagana
```
Hamesha `pm2 stop nvsricemart` / `pm2 restart nvsricemart`.

**2. `package-lock.json` repo me hai hi nahi → `npm ci` chalega hi nahi**

Aur `package.json` server ke commit (871d45f) se naye main tak **bilkul nahi
badla** — koi nayi dependency nahi. Isliye:

> **Window me `npm install` / `npm ci` chalane ki zaroorat NAHI hai.**
> Maujooda `node_modules` naye code ke liye kaafi hai.

Ye behtar bhi hai — lockfile ke bina `npm install` har baar registry se fresh
resolve karta hai, yaani window ke beech me koi dependency chup-chaap naya
version utha sakti thi. Ab wo risk hai hi nahi.

**3. `git pull` prod ka `.env` nahi badlega**

`.env` git me tracked hai (alag se theek karne wali baat hai), par uski
content 871d45f aur naye main me **bilkul same** hai — verify kiya. Pull ke
baad bhi `MONGO_URL` ProdDB pe hi rahega.

### Node 20 pe naya code chalta hai — test kiya

Repo ki alag copy `/tmp` me clone karke, **server ke apne `node_modules`** se
(live deployment ko chhue bina):

```
verify-all (static)        368 pass
verify-textCase            128 pass
verify-locations            51 pass
postman/verify             728 pass
                          ──────────
                          1275 pass, 0 fail
```

Aur asli `index.js` server pe boot karke (Rehearsal2 DB pe, port 8123):
root `HTTP 200` ✅ · vendor login ✅.

Test ke baad: dono pm2 apps wahi PID pe, uptime 6D, restarts 0 — **kuch nahi
hila**. Live API bhi chalti rahi. `/tmp/nvs-precheck` aur test dump delete.

### Backup — dono rakhenge

```bash
# 1 · off-cluster file (cluster hi chala jaye to yahi bachayega)
cd /root/NVS-Rice-Mart/server
mongodump --uri "$(grep '^MONGO_URL=' .env | sed 's/^MONGO_URL=//')" \
          --out /root/backup-$(date +%Y%m%d-%H%M)
# test dump: 996K, seconds me

# 2 · in-cluster (turant rollback ke liye)
node scripts/cloneDbForRehearsal.js \
     --from NvsRiceMart-ProdDB --to NvsRiceMart-Backup-17Sep --apply
```

⚠️ Backup DB ke naam me **"prod" mat rakhna** — script aise target pe likhne
se mana kar deti hai (`ProdBackup17Sep` refuse ho jata).

M0 free cluster pe Atlas ka apna koi snapshot nahi hota, aur cluster abhi
sirf **~10 MB / 512 MB** use kar raha hai — jagah ki koi dikkat nahi.

---

## 13. Prod migration — asli record (17 Sep 2026)

Ye wo hai jo **sach me hua**, na ki plan. Agli baar ke liye rakha gaya hai.

**Kahan se:** SSH, `root@72.62.226.17`
**Downtime:** 20:02 → 20:15 UTC ≈ **13 minute**
**Result:** ✅ successful — rollback ki zaroorat nahi padi

### Timeline (UTC)

| Waqt | Kya | Sabut |
|---|---|---|
| 20:01 | Pre-flight — nginx config padha | `date` output |
| 20:02 | nginx config backup + maintenance ON + `pm2 stop nvsricemart` | `nginx-nvsricemart.backup-20260917-2002` |
| 20:02–~20:05 | ⚠️ **Domain poori tarah down** (§13.1) | — |
| 20:03 | `mongodump` — 996K, 17 bson files | `/root/backup-20260917-2003` |
| ~20:05 | nginx config theek, maintenance 503 JSON chalu | — |
| ~20:06 | `git pull origin main` → `b9460e8` | — |
| ~20:07 | In-cluster backup `NvsRiceMart-Backup-17Sep` | counts match |
| ~20:08 | Migration **dry run** | — |
| 20:09:01 | Migration **`--apply`** → 21/21 pass | vendor user ka `createdAt` |
| 20:14:38 | `backfillTextCase --apply --yes-prod` | undo file ka naam |
| ~20:15 | `pm2 restart nvsricemart` + maintenance OFF | pm2 uptime |

### 13.1 🔴 Jo galat hua — nginx config khali ho gaya

Maintenance block `awk` se insert karne ki koshish ki. Command me quoting galat
thi — `awk` ne `%27` ko **file samajh liya** aur fail ho gaya. Do problem ek
saath mili:

1. `awk ... | sed ... > file` ek **pipeline** hai. `set -e` pipeline me sirf
   AAKHRI command ka exit code dekhta hai. `sed` safal tha, isliye script ruki
   hi nahi — aur khali output config pe `cp` ho gaya.
2. **Khali nginx config valid hoti hai** (koi server block nahi = koi syntax
   error nahi), isliye `nginx -t` bhi pass ho gaya aur reload bhi.

Natija: `api.nvsricemart.com` ka koi server block hi nahi bacha. ~3 minute
users ko maintenance JSON ki jagah **connection error** mila.

**Data pe zero asar** — app us waqt waise bhi band thi. Config backup se wapas
aa gayi.

**Sabak:**

- Config file kabhi shell quoting se mat banao. **Local pe likho, `scp` karo.**
  Aakhir me yahi kiya aur ek hi baar me chal gaya.
- `nginx -t` ka pass hona ye SABIT NAHI karta ki config sahi hai — sirf ye ki
  syntax sahi hai. Reload ke baad **hamesha `curl` se check karo**.
- Pipeline me `set -e` kaafi nahi, `set -o pipefail` bhi chahiye.

### 13.2 Dry run 257 vs apply 249 — kyun alag the

`locations` ka UPDATE count dry run me **257** tha, apply me **249**. Ye **bug
nahi hai** — summary "planned operations" ka tally hai, aur apply mode har step
pe live state dobara padhta hai:

```
dry run : 8 branch + 1 coord + 1 pickup + 147 bina-type + 100 default = 257
apply   : 8 branch + 1 coord + 1 pickup + 139 bina-type + 100 default = 249
```

Dry run me kuch likha nahi jata, isliye jab "bina type wale locations" gine
gaye to saare **147** the. Apply me wo 8 vendor branches **pehle hi**
`VENDOR_BRANCH` ban chuke the, isliye 139 bache.

Dono case me **wahi 147 locations** ko type mila — 8 ko `VENDOR_BRANCH`, 139 ko
`CUSTOMER`. Verify ne confirm kiya: `locations with null type = 0`.

### 13.3 `verify-generic-shape` ne prod pe 23 pass / 1 fail dikhaya

Fail hua check: **"naya order mila"**. Ye data ka problem nahi — wo script ek
PURANA (migrated) order aur ek NAYA (naye code se bana) order compare karti hai.
Migration ke turant baad prod pe koi naya order tha hi nahi, isliye compare ho
hi nahi sakta tha. Script khud kehti hai *"pehle koi naya order banao"*.

Migrated prod ka clone bana ke usi pe smoke chalayi (jo ek naya order banati
hai) → **31/31 pass**. Yaani baaki 23 check pehle bhi sahi the.

### 13.4 Final counts

```
                 pehle    baad
banners              5       5   (same)
carts              383     383   (same)
categories          17      17   (same)
locations          147     147   (same)
orders              82      82   (same)
products            90      90   (same)
settings             1       1   (same)
subcategories       25      25   (same)
users             1461    1462   +1 vendor (Nagraj Mart)
counters             0       4
vendorprofiles       0       1
vendorserviceareas   0       6
productlocations   521       -   DROP (backup me safe)
──────────────────────────────
TOTAL             2732    2223     2732 - 521 + 12 = 2223 ✅
```

**Kuch delete nahi hua** — na user, na order, na address, na product.

### 13.5 Verification — sab pass

```
migration verify               21/21   (13 data + 8 index)
backfillTextCase               534 docs / 1924 fields + 6 address soft-delete
  dobara dry run               0 changes          <- idempotent
cleanupLegacyArtifacts         0 changes
live customer states           3/3     (200 / 404 / 400)
clone pe postMigrationSmoke    75/75
clone pe verify-generic-shape  31/31
clone pe verify-locations-live 78/78
clone pe verify-catalog-live   29/29
```

Live API se khud check kiya (`https://api.nvsricemart.com`):

```
vendor login (nagraj@gmail.com)   token mila
vendor summary                    82 orders · Rs 1,31,816 · 52 delivered, 30 cancelled
products                          30 · "Guruji" Rs 1750        <- title case laga
orders                            NVS-2609-000009 · snapshot "Mb Jeera Raw Rice"
service-areas/check?577001        serviceable · Nagraj Mart
customer 577001                   200 · 15 categories
customer 500774                   404 PINCODE_NOT_SERVICEABLE
customer bina address             400 PINCODE_REQUIRED
```

Restart ke baad `pm2`: `nvsricemart` online, **restarts 0**, koi error log nahi.
`IFTV-OTT` chhui tak nahi gayi (uptime 6.5 din, restarts 0).

### 13.6 Plan se jo alag nikla

| Plan me tha | Asli me |
|---|---|
| `npm ci` chalana | ❌ **Zaroorat hi nahi padi.** Repo me `package-lock.json` hai hi nahi (`npm ci` fail hota hai), aur `package.json` purane commit se naye tak bilkul nahi badla. Maujooda `node_modules` kaafi tha — aur ye **safer** bhi hai, kyunki lockfile ke bina `npm install` window ke beech me koi dependency ka naya version utha sakta tha. |
| `mongodump` maujood hoga | ❌ Server pe tha hi nahi. Migration se pehle install kiya — tarball se seedha `/usr/local/bin`, koi apt repo nahi choda. |
| `pm2 stop <app>` | ⚠️ Server pe **do apps** hain — `nvsricemart` aur `IFTV-OTT`. `pm2 stop all` doosri app bhi band kar deta. Hamesha naam se. |
| Backup DB ka naam `ProdBackup17Sep` | ❌ Script "prod" wale target pe likhne se mana karti hai. `NvsRiceMart-Backup-17Sep` use kiya. |

### 13.7 Rollback ka rasta (kuch din rakhna)

```bash
pm2 stop nvsricemart
mongorestore --uri "$MONGO_URL" --drop /root/backup-20260917-2003
cd /root/NVS-Rice-Mart && git checkout 871d45f
pm2 restart nvsricemart
```

Sirf casing wapas karni ho (migration rakhni ho):

```bash
node scripts/backfillTextCase.js \
  --undo=scripts/.backfill-undo-NvsRiceMart-ProdDB-2026-09-17T20-14-38-496Z.json
```

Maujood hain: `/root/backup-20260917-2003` (mongodump) ·
`NvsRiceMart-Backup-17Sep` (in-cluster) ·
`/root/nginx-nvsricemart.backup-20260917-2002` (nginx config) · undo file

### 13.8 Ab bhi khula

| # | Cheez | Kiska |
|---|---|---|
| 1 | **1357 customers (93%)** ko ab address screen milegi. Naya app build ready hai, par purane installs wale tootenge — force-update (`minAppVersion`) abhi nahi hai | App team |
| 2 | Vendor ko batana: `bell` Rs 950 → Rs 1100, 18 products ka stock adjust hua, delivery charge abhi **OFF** hai (toggle vendor khud karega), aur password badalna | Business |
| 3 | `server/.env` **git me commit hota hai** — MONGO_URL, JWT_SECRET, Cloudinary/Razorpay/2Factor keys sab repo me hain. `.gitignore` + keys rotate karna chahiye | Backend |
| 4 | `package-lock.json` add karna — deploy reproducible rahe | Backend |
| 5 | Cluster pe prod ka data 4 jagah pada hai (`Backup-17Sep`, `Rehearsal`, `Rehearsal2`, `PostCheck`). Zaroorat khatam hote hi drop karna | Backend |
