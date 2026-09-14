# Prod Migration — Runbook & Issue Log

> **Status:** Stage pe poori tarah rehearse ho chuka. Prod ke liye ready.
> **Last updated:** 2026-09-14
> **Scripts:** `server/scripts/`

Ye doc do cheezein rakhta hai:
1. **Jo issues rehearsal me mile** — taaki prod pe dobara na hon
2. **Prod migration ka step-by-step runbook** — jab bolein tab chalane ke liye

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

### Step 3 — Dry run
```bash
MONGO_URL="<prod-uri>" node scripts/migrateToVendorModel.js
```
Numbers check karein — stage pe ye aaye the:
```
users              +1 insert,  99 update
vendorprofiles     +1
vendorserviceareas +6          (577001–577006)
locations          143         (241 field-updates, 143 unset)
categories          17 · subcategories 25 · products 113
carts              301 · orders 76 · counters +4 · settings 1
productlocations   DROP 521
```

### Step 4 — Apply
```bash
MONGO_URL="<prod-uri>" node scripts/migrateToVendorModel.js --apply
```
Aakhir me **13/13 verify checks pass** hone chahiye. Ek bhi `❌` aaye to
**rukein**, aage mat badhein.

### Step 5 — Naya code deploy

### Step 6 — Verify
```bash
MONGO_URL="<prod-uri>" node scripts/verify-generic-shape.js
```
Aur manually:
- [ ] Vendor login (`nagraj@gmail.com`) → 76 orders, 30 products dikhein
- [ ] Ek serviceable pincode ka customer → 15 categories dikhein
- [ ] Ek order place karke `PENDING → DELIVERED` chalayein

### Step 7 — App band se chalu karein

### Rollback (agar kuch bigde)
```bash
mongorestore --uri "<prod-uri>" --drop ./dump-YYYYMMDD-HHMM
```
Aur purana code wapas deploy karein.

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
| 1 | **Koi server prod pe purane ya naye code ke saath live to nahi?** (§1.10) — stage pe ye **practically ho gaya tha** (§9), isliye prod pe ise halke me mat lena | Migration se pehle |
| 2 | **Force-update mechanism** — app store rollout sabke phone pe turant nahi pahunchta. Purane app version wale naye backend pe tootenge. Backend `minAppVersion` return kare aur app "update karein" dikhaye | Prod deploy se pehle |
| 3 | 1355 customers (93%) ko pehli baar `PINCODE_REQUIRED` — **address onboarding screen** ready hona chahiye | App release ke saath |
| 4 | 13 customers service area ke bahar — `404` screen | App release ke saath |
| 5 | Order `PENDING` me atka rahe to auto-cancel job (Q20 — abhi "rehne do" tay hua) | Phase 6 |
| 6 | `productlocations` dump me hai. 1-2 mahine baad prices confirm ho jayein to dump bhi archive kar dena | Baad me |

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
