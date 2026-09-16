# NVS Rice Mart — Vendor Based Multi-Tenant Platform

> **Status:** Design / RFC — implementation se pehle review + sign-off chahiye
> **Last updated:** 2026-09-13
> **Scope:** Backend (`/server`) — data model, API contracts, phase plan, risks

---

## 1. Kya badal raha hai (Executive Summary)

### Purana model (aaj ka code)
```
Admin ──> Category ──> SubCategory ──> Product ──> (ProductLocation: pincode wise price/stock)
Customer ──> saara catalog dikhta hai ──> Cart ──> Order ──> Admin manage karta hai
Delivery distance = global Setting.delivery.shopLocationId (ek hi shop)
```

### Naya model (target)
```
Admin ──> Vendor register karta hai
            └──> Vendor Branch (physical shop, lat/lng, isDefault = pickup point)
            └──> Vendor Service Areas (jitne pincode me deliver karega)

Vendor ──> apni Category ──> SubCategory ──> Product (sab vendor ke userId se linked)
       ──> apne Orders accept / pack / deliver karta hai

Customer ──> apna pincode deta hai
            └──> us pincode ka vendor mila?
                  ├── NAHI ──> 404 PINCODE_NOT_SERVICEABLE
                  └── HAAN ──> sirf USI vendor ka catalog dikhega
            └──> Cart (usi vendor se locked)
            └──> Order usi vendor ko jaata hai
            └──> Delivery distance = vendor ke DEFAULT branch ke lat/lng ──> customer ke lat/lng

Admin ──> sab kuch dekh sakta hai (oversight), lekin operate vendor karta hai
```

**Ek line me:** platform single-shop se **multi-tenant marketplace** ban raha hai, jisme *tenant = vendor* hai aur *visibility ka key = pincode* hai.

### ✅ Locked decisions (2026-09-13)

| # | Decision | Asar |
|---|---|---|
| **D1** | **Ek pincode = ek hi vendor (exclusive territory).** Doosre vendor ko wahi pincode dene pe error — "is pincode pe already `<Shop>` hai" | `VendorServiceArea.zipcode` pe **global unique index**. Resolution hamesha ek vendor return karega — cart/order/delivery sab simple |
| **D2** | **Ek cart = ek vendor.** Doosre vendor ka item add karne pe `409 CART_VENDOR_CONFLICT` | D1 ki wajah se ye waise bhi natural hai — customer ek waqt me ek hi pincode pe hota hai. Ye guard sirf defence-in-depth ke liye (customer ne pincode badla aur purana cart pada hai) |
| **D3** | **Price/Stock sirf `Product` pe** (vendor level). `ProductLocation` read-path se hat jaayega | Dual source of truth khatam → bugs #9, #10, #11, #23 fix |
| **D4** | **Delivery charge ON, per-vendor config ke saath** (global `Setting` fallback) | `VendorProfile.delivery` override karega; `payableAmount = subTotal + deliveryCharge` |
| **D5** | **Sirf COD. Razorpay/ONLINE abhi nahi.** | `placeOrder` ka ONLINE branch, `verifyPayment`, `Transaction` — sab dormant. Code delete nahi karunga, route band kar dunga. Prod me waise bhi 0 online orders hain |
| **D6** | **Admin sirf dekh sakta hai** — order pe koi action nahi | `PUT /orders/:id/status` sirf `isVendor`. Admin ke liye read-only dashboards |
| **D7** | **Login mandatory** — guest browsing nahi | `attachServiceContext` hamesha `verifyJwtToken` ke peeche. Customer ka pincode uske apne `Location` se hi aayega |
| **D8** | **Branch + service area sirf admin manage karega.** Vendor change ke liye admin ko request karega | Vendor ke liye sab read-only. (Phase 6 me "request" model add kar sakte hain) |
| **D9** | **"Shop closed" ka concept nahi.** Order 24×7 aate rahenge, vendor kabhi bhi deliver karega | `VendorProfile.isOpen` **nahi** banega. Sirf `status` (admin suspend ke liye) |
| **D10** | **Vendor ke multiple branch ho sakte hain, par distance hamesha `isDefault` wale se** | `Location.isDefault` = pickup point, single-default invariant enforce karna zaroori. Q5(b)/geo wala kaam skip |
| **D11** | **`Order.assignedTo` / `assignedAt` fields reserve** — abhi koi staff/rider nahi | Sirf schema me field, koi API/logic nahi. Baad me migration bach jaayegi |
| **D12** | **Vendor = Nagraj Mart** — `nagraj@gmail.com` / `8210574144`. Branch `Setting.delivery.shopLocationId` (577001, `[14.464, 75.922]`) se banega | Migration ka default vendor yahi hai |
| **D13** | **Price/stock `ProductLocation` se lenge** — price jaisa hai, stock ka **minimum** | `bell` ₹950→₹1100; 21 products ka stock correct hoga |
| **D14** | **215 carts clear** — `isDeleted: true` **+ `items: []`** | Sirf `isDeleted` kaafi nahi tha: `addOrUpdateItem` `isDeleted` filter nahi lagata aur cart ko purane items ke saath revive kar deta hai |
| **D15** | **Charge sirf vendor config se.** Config khali → `deliveryCharge: 0`. Radius limit ke liye global `Setting.maxRadiusKm` (50km) safety net rahega | Migration ke baad customer ko **aaj jaisa hi** ₹0 charge dikhega — koi price shock nahi |
| **D16** | **Blocker A: dono.** Test account `6a1e620e…245b` (mobile 8210574144, 0 orders) soft-delete + unique index `{mobile, role}` / `{email, role}` pe | Index ka shape aaj ke auth lookup (`findOne({mobile, role})`) se consistent hai |
| **D17** | **Blocker B: dono delete.** `8088684570` ke dono users (0 orders, 0 address, 26ms apart) | Root cause bhi fix ho gaya — `loginOrSignInWithMobile` me `User.create` pe `await` nahi tha |
| **D18** | **App aur backend saath deploy honge** | Isliye Phase 2 pe backward-compat "grace mode" ki zaroorat nahi |
| **D19** | **Har vendor ki apni delivery setting**, wahi use manage karega. Baaki sab (shop, mobile, address, branches, service areas, commission, status) **admin ke haath me** | Naya endpoint `PUT /vendors/me/delivery` (isVendor). `PUT /vendors/update/:id` poora admin-only |
| **D20** | **`isEnabled` master switch** — default `false`, charge ₹0 | Global Setting ki values migration me vendor ke profile me **copy** hongi par switch off rahega → customer ko koi price shock nahi |
| **D21** | **Cap fields ka default `null` (= koi cap nahi), `0` nahi** | `0` hota to cap 0 ban jata aur charge hamesha ₹0 rehta — chup-chaap. `freeDeliveryAbove: 0` se to **sab free** ho jata |
| **D22** | **Koi chhupa hua code-constant fallback nahi** | Pehle vendor sirf `baseCharge` set karta to `perKmRate`/`perKgRate` `constants.js` se aa jate. Ab jo set nahi wo `0` |
| **D23** | **Platform hard caps** — `maxAllowedDeliveryCharge` (₹200) aur `maxRadiusKm` (50km). Vendor inse upar nahi ja sakta, chhota kar sakta hai | Global `Setting` me ab **sirf yahi do** fields zinda hain; baaki 9 migration me hat jayenge |

Baaki jo open the unpe meri default recommendation le li gayi hai (§10).

---

## 2. Aaj ka code — as-is analysis

Jo already ho chuka hai (acchi baat):

| Cheez | Status | File |
|---|---|---|
| `ROLES.VENDOR` exist karta hai | ✅ | [constants.js:5](../constants.js#L5) |
| `isVendor` middleware | ✅ | [validateRoles.js:45](../middlewares/validateRoles.js#L45) |
| Category / SubCategory / Product me `userId` (vendor) | ✅ | [Category.js:7](../models/Category.js#L7), [SubCategory.js:7](../models/SubCategory.js#L7), [Product.js:11](../models/Product.js#L11) |
| Category/SubCat/Product create-update-delete `isVendor` guarded | ✅ | [categories.js:13](../routes/categories.js#L13), [products.js:16](../routes/products.js#L16) |
| `Location` me `zipcode`, `coordinates`, `isVendorAddress`, `isDefault` | ✅ (partial) | [Location.js](../models/Location.js) |
| `ProductLocation` (per location price/stock) | ⚠️ exists, semantics confuse hai | [ProductLocation.js](../models/ProductLocation.js) |
| Cart me `resolvedPincode` per item | ⚠️ hai, par vendor lock nahi | [Cart.js:41](../models/Cart.js#L41) |
| Distance + delivery charge helpers | ✅ | [calculateDistanceInKm.js](../helpers/orders/calculateDistanceInKm.js) |

Jo **missing / galat** hai:

1. **Customer listing pe koi location filter nahi hai.** `getAllCategories`, `getAllSubCategories`, `getAllProducts` — teeno har role ko poora global data dete hain. `userId` ek *optional query param* hai jo client bhejta hai — matlab customer chahe to kisi bhi vendor ka `userId` daal ke uska catalog dekh sakta hai. Ye hi core gap hai.
2. **Vendor ke "service pincodes" ka koi concept nahi hai.** `Location` model overloaded hai — usme customer address bhi hai, vendor shop bhi, aur product address bhi. Kaun sa pincode kaun vendor serve karta hai, ye kahin store nahi.
3. **Order/Cart me `vendorId` nahi hai.** Order kis vendor ka hai, ye derive karne ka koi reliable tareeka nahi (items se product → product.userId karna padega, aur multi-vendor cart me wo toot jaata hai).
4. **Pickup location global hai** — `Setting.delivery.shopLocationId`, fallback `SHOP_ADDRESS` constant. Vendor-wise nahi.
5. **Order sirf admin manage kar sakta hai** (`router.put("/update/:id", isAdmin)`), vendor ke liye kuch nahi.
6. **Notification sirf admin ko jaati hai** — `sendSingleNotification` andar se `User.findOne({ role: ADMIN })` karta hai, jo bhi `userId` pass karo ignore hota hai.

Aur ~20 concrete bugs/security holes — section 9 me detail me hain.

### 2.1 Production DB snapshot — `NvsRiceMart-ProdDB` (read-only inspection, 2026-09-13)

| Collection | Count | Notes |
|---|---:|---|
| `users` | **1453** | 1 admin + 1452 customers. **0 vendors** |
| `locations` | **143** | 8 product-address (6 active), 135 customer address |
| `categories` | 17 | 15 active, 2 deleted |
| `subcategories` | 25 | 20 active, 5 deleted |
| `products` | 90 | **30 active**, 60 deleted |
| `productlocations` | **521** | 6 pincodes pe faila hua |
| `carts` | 374 | **215 active non-empty**, 76 purchased, 83 deleted |
| `orders` | **76** | 49 DELIVERED (₹1,27,216), 27 CANCELLED |
| `transactions` | **0** | — online payment kabhi use hi nahi hua (D5 confirm) |
| `settings` | 1 | `shopLocationId` = 577001 wala location |
| `banners` | 5 | |
| `subscriptions` / `privacy&policies` / `term&conditions` | 0 | khaali |

**Service area (existing):** 6 active product-address locations, sab admin (`6a1e61e0…245a`) ke owned —
`577001, 577002, 577003, 577004, 577005, 577006` (Davangere, Karnataka).
✅ **Koi duplicate active zipcode nahi** → D1 ka unique index bina dedupe ke ban jaayega.

**Customer reach:**
```
✅ serviceable    :  94 addresses,  84 customers   (577001-577006)
❌ bahar          :  15 addresses,  13 customers   (577007, 577008, 577601,
                                                    583131, 457887, 581110, 581306,
                                                    834008, 500774, 570034, 94043)
⚪ koi address nahi: 1356 customers  ← 1452 me se sirf 96 ke paas address hai
```

#### 🔴 Migration blockers jo prod data me actually mile

| # | Finding | Impact |
|---|---|---|
| **M1** | **Catalog me `userId` ek bhi doc me set nahi hai.** Categories 17/17, SubCategories 25/25, Products 90/90 — sab `userId: undefined` | Schema me field add ho chuki hai par data me nahi. **Migration ke bina Phase 2 ka filter sab kuch chhupa dega** (`userId ∈ [vendorId]` kisi se match nahi karega → har customer ko empty list) |
| **M2** | **`isDefault` poore DB me kahin `true` nahi hai** (143/143 locations false) | Pickup point exist hi nahi karta. Migration me vendor ke ek branch pe `isDefault: true` set karna hoga, warna har order `503 VENDOR_PICKUP_MISSING` |
| **M3** | **Price divergence bahut kam hai.** Sirf **ACTIVE locations** pe filter karne ke baad: 29/30 products ka `ProductLocation.price` == `Product.generalPrice`. Sirf **`bell`** alag hai — Product ₹950 vs PL ₹1100, aur 577006 pe uski PL row hi nahi hai.<br>*(Pehla sample galat tha — usme deleted locations ki rows bhi thi, jo customer ko kabhi dikhti hi nahi. 521 me se **54 rows dead** hain.)* | **Q17 decision: PL wala price lenge.** Impact sirf ek product pe — `bell` ₹950 → ₹1100. Ye waise bhi consistency fix hai: listing me ₹950 dikhta tha par cart-verify ke baad ₹1100 lagta tha |
| **M3b** | **Stock 21/30 products me mismatch** — `Product` hamesha zyada (bell 597 vs 500, black bullet 643 vs 524, hamsa 623 vs 512). Wajah: `removeItem` cart se hatane pe `Product.stockQuantity` badha deta tha, jabki order `ProductLocation` se ghatata tha | **Q23 decision: live PL ka MINIMUM lenge.** Kuch products me 2 alag PL values hain (`bhanu` 517/506) kyunki `placeOrder` bina `locationId` filter ke arbitrary row ghatata tha. Migration ke baad vendor se ek physical stock audit karwa lena behtar hoga |
| **M4** | **577006 ke duplicate `ProductLocation` rows** — 96 rows vs baaki pincodes ke 85. Wajah: 577006 ke 3 location docs (2 deleted) aur unique index `{productId, locationId}` pe hai, `zipcode` pe nahi | D3 ke baad ye anyway irrelevant ho jaayega, par agar kabhi `ProductLocation` revive kiya to pehle clean karna |
| **M5** | **Duplicate mobile:** `8088684570` → 2 active users | `users.mobile` pe unique index banane se pehle ye resolve karna (merge ya ek ko deactivate) |
| **M6** | 1397 users ke paas email nahi, 56 ke paas mobile nahi | Unique index **partial/sparse** hona chahiye (`{ mobile: 1 }, { unique: true, partialFilterExpression: { mobile: { $type: "string" }, isDeleted: false } }`) |
| **M7** | **27 duplicate SKUs** (deleted products ko milakar). Active me 0 | Product SKU unique index me `partialFilterExpression: { isDeleted: false }` **zaroori** hai |
| **M8** | **577006 ka active location coordinates `[13.97668, 75.82694]`** hai, baaki sab `[14.464, 75.92]` — **~55 km ka fark** | Agar galti se ye pickup ban gaya to har order `OUT_OF_RADIUS` ya galat delivery charge. Verify karna hoga ki sahi coords kaunse hain |
| **M9** | **Indexes lagbhag zero hain.** Sirf `_id`, plus `locations` pe wo bekaar `location_2dsphere`, aur `productlocations` ke 3 | 1453 users / 521 PL / 374 carts pe har query collection scan. Phase 0 me indexes must |
| **M10** | **`orders.deliveryPincode` 76/76 me khaali** | Backfill `deliveryLocation.zipcode` se |
| **M11** | 215 active non-empty carts | Inko `vendorId` backfill karna hoga (ya clear — price/stock waise bhi re-verify hoga). **Safest: clear kar do**, user ko bas dobara add karna padega |

> **Ek baat clear hai:** ye ek **single-shop** business hai jo Davangere ke 6 pincodes pe chal raha hai. Poora existing catalog + saare orders **ek hi vendor** ke honge. Migration ka matlab hai: ek vendor banao, aur 17 + 25 + 90 + 76 + 6 docs usko point kar do.

---

## 3. Core design decision: "Customer ko kaise pata chale ki kya dikhana hai"

Ye poore project ka dil hai. **D1 (ek pincode = ek vendor)** ki wajah se chain bilkul seedhi hai:

```
customer ka pincode
      │
      ▼
VendorServiceArea.findOne({ zipcode })  ← ek indexed lookup, unique index
      │
      ├── nahi mila ──────────────> 404 { code: "PINCODE_NOT_SERVICEABLE" }
      ├── vendor suspended/closed ─> 404 { code: "PINCODE_NOT_SERVICEABLE" }
      │
      ▼
  vendorId  (exactly one)
      │
      ▼
Category / SubCategory / Product  WHERE userId = vendorId
```

> **Note:** code me `vendorIds` **array** hi rakhunga (customer ke liye hamesha length 1). Isse teeno services ka filter ek hi shape rahega (`{ $in: vendorIds }`), admin mode bhi usi code path se chalega, aur kal ko agar multi-vendor karna pada to sirf `resolveServiceContext` badalna padega — services/controllers ko haath nahi lagana padega.

### 3.1 Customer ka pincode aayega kahan se? (3 tareeke, priority order)

| Priority | Source | Kab |
|---|---|---|
| 1 | `?locationId=<id>` query param | Customer ne apne saved addresses me se koi select kiya |
| 2 | Customer ka default `Location` (`isDefault: true`) | Kuch nahi bheja — logged-in user ka default address |
| 3 | `?zipcode=577001` query param | "Deliver to" picker — customer ne address save karne se pehle pincode check kiya |

Agar teeno me se kuch nahi mila → `400 { code: "PINCODE_REQUIRED" }` (404 nahi, kyunki ye customer ki galti hai, serviceability ka issue nahi).

> **D7 — login mandatory.** Guest browsing nahi hai, matlab har listing call `verifyJwtToken` ke peeche hai aur `req.userId` hamesha available hai. Isliye **priority 2 (saved default address) hi 95% cases me chalega** — app ko kuch bhejne ki zaroorat hi nahi.
>
> ⚠️ **Prod data pe dhyan:** 1452 customers me se sirf **96 ke paas koi address hai**. Matlab 1356 logged-in customers ko pehli baar `400 PINCODE_REQUIRED` milega. App ko iske liye ek **"Add your delivery address" onboarding screen** chahiye — warna wo log app khol ke khaali screen dekhenge. Ye frontend ka kaam hai par Phase 2 ke saath hi ship hona chahiye.

> **Important:** pincode **kabhi bhi client ke bharose nahi** chhodna jahan paisa involved ho. Listing me client-provided pincode chalega, lekin **cart verify aur order place pe hamesha server `locationId` se `Location` uthayega aur uska zipcode use karega**. Aaj `placeOrder` ye sahi kar raha hai ([placeOrder.js:67](../services/orders/placeOrder.js#L67)) — wo behaviour rakhna hai.

### 3.2 Ek reusable middleware — `attachServiceContext`

Har listing API pe same 15 line repeat karne ke bajaye ek middleware:

```js
// middlewares/attachServiceContext.js
// req.serviceContext = { mode, pincode, vendorIds }
//   mode: "CUSTOMER" | "VENDOR" | "ADMIN"

exports.attachServiceContext = asyncWrapper(async (req, res, next) => {
  const role = req.role;

  // ── Vendor: sirf apna data ──────────────────────────────
  if (role === ROLES.VENDOR) {
    req.serviceContext = { mode: "VENDOR", vendorIds: [req.userId] };
    return next();
  }

  // ── Admin: sab kuch, ya explicit ?vendorId= filter ──────
  if (role === ROLES.ADMIN || role === ROLES.STAFF) {
    req.serviceContext = {
      mode: "ADMIN",
      vendorIds: req.query.vendorId ? [toObjectId(req.query.vendorId)] : null, // null = no filter
    };
    return next();
  }

  // ── Customer: pincode resolve karo ──────────────────────
  const ctx = await resolveServiceContext({
    zipcode:    req.query.zipcode,
    locationId: req.query.locationId,
    userId:     req.userId,
  });
  // ctx = { pincode, vendorId, vendorIds: [vendorId], servingLocationId, vendor }
  req.serviceContext = { mode: "CUSTOMER", ...ctx };
  next();
});
```

```js
// services/serviceAreas/resolveServiceContext.js
exports.resolveServiceContext = async ({ zipcode, locationId, userId }) => {
  // 1) pincode nikalo
  let pincode = zipcode?.trim();
  if (!pincode && locationId) {
    const loc = await Location.findOne({
      _id: locationId, userId, isDeleted: false,
    }).select("zipcode").lean();
    pincode = loc?.zipcode;
  }
  if (!pincode && userId) {
    const def = await Location.findOne({
      userId, type: LOCATION_TYPES.CUSTOMER, isDefault: true, isDeleted: false,
    }).select("zipcode").lean();
    pincode = def?.zipcode;
  }
  if (!pincode) throwError(400, "Please select a delivery location", "PINCODE_REQUIRED");

  // 2) us pincode ka vendor (D1: sirf ek ho sakta hai)
  const area = await VendorServiceArea.findOne({
    zipcode: pincode, isActive: true, isDeleted: false,
  }).select("vendorId locationId etaMinutes minOrderAmount").lean();

  if (!area) {
    throwError(404, `We don't deliver to ${pincode} yet`, "PINCODE_NOT_SERVICEABLE");
  }

  // 3) vendor live hai? (suspended / deleted / shop closed ka catalog nahi dikhna chahiye)
  const vendor = await User.findOne({
    _id: area.vendorId, role: ROLES.VENDOR, isActive: true, isDeleted: false,
  }).select("_id name").lean();

  // D9: koi "shop closed" nahi — sirf admin ka suspend check
  const profile = vendor && await VendorProfile.findOne({
    vendorId: vendor._id, status: "APPROVED", isDeleted: false,
  }).select("shopName defaultLocationId delivery").lean();

  if (!vendor || !profile) {
    throwError(404, `We don't deliver to ${pincode} yet`, "PINCODE_NOT_SERVICEABLE");
  }

  return {
    pincode,
    vendorId:  vendor._id,
    vendorIds: [vendor._id],          // services ka uniform filter shape
    servingLocationId: area.locationId,
    vendor: { _id: vendor._id, shopName: profile.shopName, etaMinutes: area.etaMinutes },
  };
};
```

### 3.3 Service ab sirf ek line se filter hoga

`getAllProducts` / `getAllCategories` / `getAllSubCategories` me sirf itna add hoga:

```js
// service signature: (query, serviceContext)
if (serviceContext?.vendorIds) {
  match.userId = { $in: serviceContext.vendorIds };
}
if (serviceContext?.mode === "CUSTOMER") {
  match.isActive = true;              // customer ko inactive kabhi nahi
}
```

Aur `userId` query param **customer ke liye ignore** hoga (validator me allow rahega but service override karega) — warna customer dusre vendor ka catalog forcefully dekh lega.

> ⚠️ Ye teen services abhi `query` object seedha lete hain. Signature `(query, serviceContext)` karna padega aur teeno controllers update honge. Ye breaking change hai — ek hi commit me karo.

### 3.4 "404 kab" — ye clearly separate karna hai

Aaj `pagination()` util **khaali result pe hamesha 404** phenkta hai ([pagination.js:29](../utils/pagination.js#L29)). Isse app ko pata nahi chalta ki:

- pincode serve hi nahi hota, ya
- pincode serve hota hai par us category me abhi product nahi hai

App ka UX dono me alag hona chahiye. Isliye **error codes** introduce karo:

| Situation | HTTP | `code` | App kya dikhaye |
|---|---|---|---|
| Customer ne koi pincode select nahi kiya | 400 | `PINCODE_REQUIRED` | "Select delivery location" sheet |
| Us pincode pe koi active vendor nahi | 404 | `PINCODE_NOT_SERVICEABLE` | "Hum yahan abhi deliver nahi karte" screen |
| Vendor hai, par list khaali | **200** | — | "No products found" empty state |
| Product exist karta hai par is pincode pe nahi | 404 | `PRODUCT_NOT_AVAILABLE_HERE` | "Ye item aapke area me available nahi" |

**Recommendation:** `pagination()` me ek `{ throwOnEmpty: false }` option add karo aur customer listing APIs me `false` pass karo. Purane admin APIs ka behaviour na badle isliye default `true` hi rehne do.

---

## 4. Data model changes

### 4.1 NEW — `VendorServiceArea` (sabse important addition)

Ye batata hai "kaun sa vendor kaun se pincode pe deliver karta hai".

```js
// models/VendorServiceArea.js
const vendorServiceAreaSchema = new mongoose.Schema({
  vendorId:   { ...userField, required: true },
  locationId: { ...locationField, required: true }, // kaun si branch serve karegi
  zipcode:    { type: String, required: true, trim: true },
  // NOTE: `lowercase: true` 16 Sep 2026 ko hata diya gaya — display
  // fields ab proper case me save hote hain (runbook §10). Is collection
  // pe har lookup `zipcode`/`vendorId`/`_id` se hota hai, in fields se
  // kabhi nahi — isliye koi query nahi tooti.
  city:       { type: String },
  district:   { type: String },
  state:      { type: String },
  country:    { type: String, default: DEFAULT_COUNTRY },  // "India"

  // optional per-area overrides (Phase 6)
  deliveryChargeOverride: { type: Number },
  minOrderAmount:         { type: Number, default: 0 },
  freeDeliveryAbove:      { type: Number },
  etaMinutes:             { type: Number },

  isActive:  { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

// 🔒 D1 — EXCLUSIVE TERRITORY: ek pincode sirf ek vendor ke paas.
//    Ye DB-level guarantee hai; application check ke saath double protection.
//    partial filter isliye taaki soft-deleted row pincode block na kare.
vendorServiceAreaSchema.index(
  { zipcode: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
// customer lookup ka hot path (upar wala unique index hi serve karega,
// par isActive bhi cover ho jaye isliye compound)
vendorServiceAreaSchema.index({ zipcode: 1, isActive: 1, isDeleted: 1 });
vendorServiceAreaSchema.index({ vendorId: 1, isActive: 1, isDeleted: 1 });
```

**Pincode conflict handling (D1).** Admin jab service area add kare:

```js
const existing = await VendorServiceArea.findOne({
  zipcode, isDeleted: false,
}).lean();

if (existing && String(existing.vendorId) !== String(vendorId)) {
  const holder = await VendorProfile.findOne({ vendorId: existing.vendorId })
    .select("shopName").lean();
  throwError(
    409,
    `Pincode ${zipcode} is already assigned to "${holder?.shopName || "another vendor"}"`,
    "PINCODE_ALREADY_ASSIGNED",
    { zipcode, vendorId: existing.vendorId, shopName: holder?.shopName },
  );
}
```

- Application check (upar) → achha error message deta hai
- Unique index → race condition me bhi guarantee (do admin ek saath same pincode daalein). `E11000` duplicate key error ko catch karke wahi `409 PINCODE_ALREADY_ASSIGNED` me convert karo (`errorHandler` middleware me).
- **Pincode transfer:** ek vendor se doosre ko dena ho to explicit API — `PUT /service-areas/:zipcode/reassign { toVendorId }` (isAdmin). Purani row soft-delete + nayi create, ek transaction me. Chup-chaap overwrite **kabhi nahi**.

**Aap `Location` me hi ye kyun nahi rakh sakte?** Rakh sakte ho (jaisa abhi plan tha), lekin:
- 50 pincode = 50 full `Location` docs, har ek me dummy `address`/`coordinates` daalne padenge (`createLocation` abhi 6 fields mandatory maangta hai — [createLocation.js:31](../services/locations/createLocation.js#L31))
- `Location` pehle se 3 kaam kar raha hai (customer address, vendor shop, product address) — 4th role dene se `isProductAddress` / `isVendorAddress` / `isDefault` flags ka combination unmanageable ho jaayega
- Har `createLocation` call `user.locationId = location._id` set karta hai ([createLocation.js:74](../services/locations/createLocation.js#L74)) — 50 service areas banate hi vendor ka "main" location 50 baar overwrite ho jaayega

Alag model rakhne se lookup bhi sasta hai (chhoti collection, focused index).

### 4.2 NEW — `VendorProfile`

`User` ko business fields se bharna theek nahi.

```js
// models/VendorProfile.js
const vendorProfileSchema = new mongoose.Schema({
  vendorId:  { ...userField, required: true, unique: true },
  shopName:  { type: String, required: true, trim: true },
  legalName: { type: String, trim: true },
  gstNumber: { type: String, trim: true, uppercase: true },
  fssaiNumber: { type: String, trim: true },
  logo:      { type: String },
  supportMobile: { type: String },

  // pickup point — vendor ka default branch (distance isi se calculate hoga)
  defaultLocationId: locationField,

  // per-vendor delivery config; missing fields global Setting se fallback
  delivery: {
    baseCharge: Number, perKmRate: Number, perKgRate: Number,
    minDeliveryCharge: Number, baseMaxCharge: Number,
    maxPerKgIncrement: Number, maxPerKmIncrement: Number,
    maxRadiusKm: Number,
    freeDeliveryAbove: Number,
  },

  commissionPercent: { type: Number, default: 0 },  // platform ka cut
  payout: { accountHolder: String, accountNumber: String, ifsc: String, upiId: String },

  status: {
    type: String,
    enum: ["APPROVED", "SUSPENDED"],
    default: "APPROVED",   // admin khud bana raha hai, isliye default approved
  },
  // D9: `isOpen` / shop-timing ka field NAHI — order 24×7 aate rahenge
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });
```

`status === "SUSPENDED"` → `resolveServiceContext` us vendor ko drop kar dega, customer ko `404 PINCODE_NOT_SERVICEABLE` milega. Ye sirf admin ka control hai (vendor khud kuch band nahi kar sakta — D8).

### 4.3 `Location` — cleanup

```js
// models/Location.js  (changes)
type: {
  type: String,
  enum: ["CUSTOMER", "VENDOR_BRANCH"],   // LOCATION_TYPES constant
  required: true,
},
// isProductAddress  → DEPRECATE (VendorServiceArea ne replace kar diya)
// isVendorAddress   → type === "VENDOR_BRANCH" se derive
isDefault: { type: Boolean, default: false },  // ab dono side use hoga:
                                              //  CUSTOMER: default delivery address
                                              //  VENDOR_BRANCH: pickup point

// GeoJSON — future me "nearest branch" / radius query ke liye
geo: {
  type:        { type: String, enum: ["Point"], default: "Point" },
  coordinates: { type: [Number], default: undefined },  // [lng, lat] — GeoJSON order
},
```

Indexes:
```js
locationSchema.index({ userId: 1, type: 1, isDefault: 1 });
locationSchema.index({ zipcode: 1 });
locationSchema.index({ geo: "2dsphere" }, { sparse: true });
// PURANA GALAT INDEX HATAO:
// locationSchema.index({ location: "2dsphere" })  ← "location" field exist hi nahi karta
```

> **Coordinate order:** Aaj `coordinates` = `[lat, lng]` hai (code isi tarah padhta hai — [placeOrder.js:83](../services/orders/placeOrder.js#L83)), lekin validator ka message "[longitude, latitude]" bolta hai ([locations.js:22](../validator/locations.js#L22)). **Decision: `coordinates` = `[lat, lng]` hi rahega** (existing data safe), aur naya `geo.coordinates` = `[lng, lat]` GeoJSON standard follow karega. Validator ka message fix karna hai.

Aur ek invariant: **ek user/vendor ka sirf ek `isDefault: true` location** — set karte waqt transaction me baaki ko `false` karo.

### 4.4 `Product` / `Category` / `SubCategory`

Model me field add karne ki zaroorat nahi (`userId` already hai), sirf **indexes + uniqueness scope** fix karna hai:

```js
// Category
categorySchema.index({ userId: 1, isDeleted: 1, isActive: 1 });
categorySchema.index({ userId: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

// SubCategory
subCategorySchema.index({ userId: 1, categoryId: 1, isDeleted: 1 });
subCategorySchema.index({ categoryId: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

// Product
productSchema.index({ userId: 1, isDeleted: 1, isActive: 1 });
productSchema.index({ userId: 1, categoryId: 1, subCategoryId: 1 });
productSchema.index({ userId: 1, SKU: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
productSchema.index({ name: "text", brand: "text", description: "text" });  // search ke liye
```

⚠️ Abhi duplicate check **global** hai — do vendor "Rice" category ya same product nahi bana sakte. Ye **pehla din break** karega. Detail section 9.

### 4.5 `Cart` — vendor lock

```js
// models/Cart.js  (changes)
vendorId:        { ...userField },           // cart kis vendor ka hai
deliveryZipcode: { type: String },           // verify ke waqt resolve hua pincode
verifiedAt:      { type: Date },             // verification kab hui (stale check)
```

`cartItemSchema` me `vendorId` bhi rakh lo (denormalized) — future multi-vendor split ke liye ready rahega.

### 4.6 `Order` — vendor scoping + proper lifecycle

```js
// models/Order.js  (changes)
vendorId:         { ...userField, required: true },   // 🔴 sabse important addition
vendorLocationId: { ...locationField },               // pickup branch (distance ka source)
deliveryPincode:  { type: String, required: true },   // aaj set hi nahi hota
orderNumber:      { type: String, unique: true },     // human readable: NVS-2609-000123

status: {
  type: String,
  enum: [
    "INITIATED",        // banaya, payment pending
    "PENDING",          // vendor ke paas aa gaya (COD ya payment success)
    "ACCEPTED",         // vendor ne approve kiya
    "PACKED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",        // customer ne cancel kiya
    "REJECTED",         // vendor ne reject kiya
    "RETURNED",         // optional, Phase 6
  ],
  default: "INITIATED",
},
statusHistory: [{
  status: String,
  changedBy: userField,
  changedByRole: String,
  note: String,
  at: { type: Date, default: Date.now },
}],
cancelReason: { type: String },
deliveredAt:  { type: Date },
expectedDeliveryAt: { type: Date },

// D11 — abhi koi staff/rider nahi. Sirf field reserve, koi API/logic nahi.
// Baad me rider app aaya to schema migration nahi karni padegi.
assignedTo: { ...userField, default: null },
assignedAt: { type: Date, default: null },
```

**D5 — payment:** `paymentMethod` enum me `"ONLINE"` **rehne do** (76 purane orders ka data valid rahe), par naya order sirf `COD` accept karega. Validator me: `Joi.string().valid("COD")`. `paymentStatus` COD me hamesha `NOT_REQUIRED`.

`orderItemSchema` me `vendorId` + `productSnapshot` (name, SKU, image, weight) — product delete ho jaye to bhi purana order readable rahe.

Indexes:
```js
orderSchema.index({ vendorId: 1, status: 1, createdAt: -1 });   // vendor dashboard
orderSchema.index({ userId: 1, createdAt: -1 });                // customer orders
orderSchema.index({ razorpayOrderId: 1 });
```

### 4.7 `ProductLocation` — ✅ **Decided: Option A** (price/stock sirf `Product` pe)

Aaj **do jagah stock/price hai** — `Product.stockQuantity`/`generalPrice` aur `ProductLocation.stockQuantity`/`price`. Ye dono kabhi sync nahi hote:

- `addOrUpdateItem` cart me `Product.generalPrice` use karta hai
- `verifyCartByPincode` `ProductLocation.price` use karta hai
- `getCart` wapas `Product.generalPrice` set kar deta hai — matlab verify ke baad bhi price palat jaata hai
- `placeOrder` / `verifyPayment` stock `ProductLocation` se ghatate hain, par `Product.stockQuantity` kabhi nahi ghatta
- `removeItem` `Product.stockQuantity` **badha deta hai** jabki add pe kabhi ghataya hi nahi gaya → **stock infinite grow karega**

Do raaste:

| | **Option A ✅ CHOSEN (D3)** | **Option B (future, Phase 7+)** |
|---|---|---|
| Price/Stock source | Sirf `Product` (vendor level) | `ProductLocation` (per branch) |
| `VendorServiceArea` ka role | Sirf *visibility* decide karta hai | Visibility + per-branch pricing |
| Kab sahi hai | Vendor ke saare pincodes pe same rate | Vendor ke alag-alag branch, alag godown stock |
| Complexity | Kam — ek source of truth | Zyada — har product × har branch row |

**Kya karna hai:**
- `ProductLocation` model **delete mat karo** — sirf read/write path se hata do, taaki future me enable karna easy rahe
- `verifyCartByPincode` → `ProductLocation.price/stockQuantity` ke bajaye `Product.generalPrice/stockQuantity`
- `placeOrder` + `verifyPayment` → stock `Product` pe `$inc` karein, `ProductLocation` pe nahi
- Routes `PUT /products/update-product-locations` aur `DELETE /products/remove-product-locations` → **abhi ke liye disable** karo (ya `isAdmin` ke peeche daal do). Aaj inpe koi auth hai hi nahi — issue #2
- `getCart` ka price-overwrite ab problem nahi rahega kyunki source ek hi hai — par `priceSnapshot` fir bhi rakhna hai (order place hone tak price freeze rahe)

**Stock ka single pattern (race-safe), har jagah yahi:**
```js
const r = await Product.updateOne(
  { _id: productId, userId: vendorId, isDeleted: false,
    stockQuantity: { $gte: qty } },
  { $inc: { stockQuantity: -qty } },
  { session },
);
if (!r.modifiedCount) throwError(409, `${name} is out of stock`, "STOCK_UNAVAILABLE");
```
Cart me stock **kabhi** reserve nahi hoga — sirf order place hone pe. (Aaj `removeItem` cart se hatate waqt stock badha deta hai — issue #10.)

### 4.8 Model relationship diagram

```
User(role=admin)
   │ creates
   ▼
User(role=vendor) ──1:1──> VendorProfile ──> defaultLocationId ─┐
   │                                                            │
   ├──1:N──> Location(type=VENDOR_BRANCH) ◄─────────────────────┘
   │              ▲
   │              │ locationId
   ├──1:N──> VendorServiceArea { zipcode }   ◄── customer lookup yahan hit karta hai
   │
   ├──1:N──> Category ──1:N──> SubCategory ──1:N──> Product
   │
   └──1:N──> Order ──> items[] ──> Product
                 │
                 └──> locationId ──> Location(type=CUSTOMER)

User(role=user)
   ├──1:N──> Location(type=CUSTOMER, ek isDefault)
   ├──1:1──> Cart (vendorId se locked)
   └──1:N──> Order
```

---

## 5. API design

### 5.1 Admin — vendor onboarding (naya)

| Method | Route | Guard | Kaam |
|---|---|---|---|
| `POST` | `/vendors/create` | `isAdmin` | Vendor user + VendorProfile ek transaction me banaye |
| `GET` | `/vendors/getAll` | `isAdmin` | Vendors list (profile + serviceArea count + order count) |
| `GET` | `/vendors/get/:id` | `isAdmin \| isVendor(self)` | Vendor detail |
| `PUT` | `/vendors/update/:id` | `isAdmin` | Profile update. **D8: vendor khud edit nahi kar sakta** — admin ko request karega |
| `PUT` | `/vendors/status/:id` | `isAdmin` | APPROVED / SUSPENDED |
| `POST` | `/vendors/:id/branches` | **`isAdmin`** | Branch (Location type=VENDOR_BRANCH) banaye — D8 |
| `GET` | `/vendors/:id/branches` | `isAdmin \| isVendor(self)` | List (vendor ke liye read-only) |
| `PUT` | `/vendors/:id/branches/:locationId/default` | **`isAdmin`** | Pickup point set kare (D10 — distance isi se) |
| `POST` | `/vendors/:id/service-areas` | `isAdmin` | **Bulk** pincodes add kare (conflict pe 409) |
| `GET` | `/vendors/:id/service-areas` | `isAdmin \| isVendor(self)` | List (vendor ke liye read-only) |
| `DELETE` | `/vendors/:id/service-areas/:areaId` | `isAdmin` | Soft delete (pincode free ho jaayega) |
| `GET` | `/service-areas/lookup?zipcode=560001` | `isAdmin` | Ye pincode kis vendor ke paas hai — **add karne se pehle check** |
| `PUT` | `/service-areas/reassign` | `isAdmin` | `{ zipcode, toVendorId, toLocationId }` — ek vendor se doosre ko transfer |

Bulk service area payload:
```json
POST /vendors/:id/service-areas
{
  "locationId": "66f...",           // kaun si branch serve karegi
  "areas": [
    { "zipcode": "560001", "city": "bengaluru", "district": "bengaluru urban", "state": "karnataka" },
    { "zipcode": "560002" },
    { "zipcode": "577001", "etaMinutes": 180 }
  ]
}
```

**Bulk me conflict kaise handle ho? — atomic rakho (D1):**

```json
409 Conflict
{
  "success": false,
  "code": "PINCODE_ALREADY_ASSIGNED",
  "message": "2 pincodes are already assigned to other vendors",
  "data": {
    "conflicts": [
      { "zipcode": "560002", "vendorId": "66a...", "shopName": "sharma traders" },
      { "zipcode": "577001", "vendorId": "66b...", "shopName": "nvs davangere" }
    ]
  }
}
```

**Rule: all-or-nothing.** Agar ek bhi pincode conflict kare to **poora batch reject** — kuch add, kuch skip wala partial state confusing hota hai (admin ko lagta hai sab ho gaya). Admin conflict list dekh ke ya to wo pincode hata de, ya `reassign` API use kare.

Flow:
```
1. Saare zipcodes validate (regex, country)
2. VendorServiceArea.find({ zipcode: { $in: [...] }, isDeleted: false })
3. Koi doosre vendor ka? ──> 409 conflicts[] ke saath, kuch likha nahi
4. Apne hi vendor ka? ──> update (locationId / eta / isActive)
5. Naya? ──> insert
6. Sab kuch ek session transaction me
7. E11000 catch ──> 409 PINCODE_ALREADY_ASSIGNED (race condition safety net)
```

### 5.2 Customer — serviceability (naya)

| Method | Route | Guard | Kaam |
|---|---|---|---|
| `GET` | `/service-areas/check?zipcode=577001` | `verifyJwtToken` (D7: login mandatory) | Serviceability + vendor info |

```json
200 OK
{
  "serviceable": true,
  "zipcode": "560001",
  "vendor": {
    "id": "66f...",
    "shopName": "nvs rice mart bengaluru",
    "logo": "https://...",
    "etaMinutes": 120,
    "minOrderAmount": 0,
    "freeDeliveryAbove": 999
  }
}

404 Not Found
{ "success": false, "code": "PINCODE_NOT_SERVICEABLE",
  "message": "We don't deliver to 110001 yet",
  "data": { "zipcode": "110001" } }
```

Ye app ka **pehla call** hoga — splash / location picker pe. Isse app ko pata chal jaayega ki catalog dikhana hai ya "not serviceable" screen. Response cacheable hai (Phase 7 me Redis).

### 5.3 Listing APIs — changes

| Route | Aaj | Naya |
|---|---|---|
| `GET /categories/getAll` | global | + `attachServiceContext` → `userId ∈ vendorIds`, customer ke liye `isActive: true` |
| `GET /subCategories/getAll` | global | same |
| `GET /products/getAll` | global | same + `isOutOfStock: false` (customer ke liye) |
| `GET /products/get/:id` | koi check nahi | product ka `userId` serving vendors me hai? nahi → `404 PRODUCT_NOT_AVAILABLE_HERE` |
| `GET /banners/getAll` | global | Phase 6: vendor-specific banners |

Naye query params (teeno pe): `zipcode`, `locationId`, `vendorId` (sirf admin), aur `categories` pe optional `onlyWithProducts=true`.

Validators (`validator/categories.js`, `subCategories.js`, `products.js`) me ye params add karne honge, warna Joi 422 dega.

### 5.4 Cart — vendor lock

| Route | Change |
|---|---|
| `POST /carts/add-or-update` | Product ka `userId` nikaalo. Cart khaali hai → `cart.vendorId` set karo. Cart me pehle se dusra vendor hai → `409 { code: "CART_VENDOR_CONFLICT", currentVendor, newVendor }`. Saath me `?replaceCart=true` flag ho to purana cart clear karke naya banao. |
| `POST /carts/verify-delivery` | `Location`/`isProductAddress` ke bajaye `VendorServiceArea` check karo: `{ vendorId: cart.vendorId, zipcode, isActive: true }`. Nahi mila → `{ status: "FAILED", code: "VENDOR_NOT_SERVICEABLE" }`. Saath me `cart.deliveryZipcode` + `verifiedAt` set karo. |
| `GET /carts/get` | Price wapas `generalPrice` se overwrite **mat karo** agar `verifiedAt` fresh hai. |
| `PUT /carts/remove/:productId` | `Product.stockQuantity` ko **haath mat lagao** (aaj lagata hai — bug). |

**Conflict kab actually hoga? (D1 ke baad)**

Exclusive territory me customer ek waqt me ek hi vendor dekhta hai, isliye normal flow me conflict aayega hi nahi. Ye guard in cases ke liye hai:

1. Customer ne **delivery address badla** (pincode 560001 → 577001) — purana cart Vendor A ka hai, naya area Vendor B ka
2. Pincode **reassign** ho gaya (admin ne territory transfer ki)
3. Purana cart pada hai (7 din se), us beech vendor suspend ho gaya

```
add-to-cart / address change ──> 409 CART_VENDOR_CONFLICT
      └──> app dialog: "Aapka cart <Shop A> ka hai. <577001> pe <Shop B>
                        deliver karta hai. Cart clear karke aage badhein?"
           └──> yes ──> POST /carts/add-or-update?replaceCart=true
                        (ya DELETE /carts/clear phir add)
```

**Address switch pe proactive check:** jab customer address dropdown se pincode badle, app `GET /service-areas/check` + `GET /carts/get` dono dekhe. Cart ka `vendorId` mismatch ho to **wahin dialog dikha do** — checkout tak mat rukho, warna user 10 item daalne ke baad pata chalega.

### 5.5 Order

| Method | Route | Guard | Change |
|---|---|---|---|
| `POST` | `/orders/preview` | `isUser` | Checkout se pehle total dikhane ke liye (read-only) |
| `POST` | `/orders/create` | `isUser` | `vendorId` = `cart.vendorId`; pickup = vendor ka default branch; `deliveryPincode` set; **sirf COD** (D5); serviceability dobara verify |
| ~~`POST`~~ | ~~`/orders/verify-payment`~~ | — | **D5: route band.** Code rahega, mount nahi hoga. (Enable karte waqt pehle `status = "PAID"` wala bug fix karna — enum me PAID hai hi nahi) |
| `GET` | `/orders/getAll` | `verifyJwtToken` | **Role scoping:** user → `userId=self`, vendor → `vendorId=self`, admin → sab (read-only). Aaj koi scoping nahi hai 🔴 |
| `GET` | `/orders/get/:id` | `verifyJwtToken` | Ownership check (user/vendor/admin) |
| `PUT` | `/orders/:id/status` | **`isVendor` only** | State machine validate kare (niche). **D6: admin ko yahan access nahi** |
| `PUT` | `/orders/:id/cancel` | `isUser` | Sirf `PENDING`/`ACCEPTED` tak allowed |
| `GET` | `/orders/vendor/summary` | `isVendor` | Dashboard counts (new/accepted/out/delivered/today's revenue) |
| `GET` | `/orders/admin/summary` | `isAdmin` | **Read-only** oversight — vendor-wise counts/revenue |

**Status state machine** (service me hard enforce karo, `updateOrder` ke blanket `Object.entries → order.set()` ke bajaye — aaj koi bhi field kuch bhi set kar sakta hai):

```
INITIATED ──payment success / COD──> PENDING
PENDING   ──vendor──> ACCEPTED | REJECTED
PENDING   ──customer──> CANCELLED
ACCEPTED  ──vendor──> PACKED | CANCELLED
ACCEPTED  ──customer──> CANCELLED   (COD me; prepaid me refund flow)
PACKED    ──vendor──> OUT_FOR_DELIVERY
OUT_FOR_DELIVERY ──vendor──> DELIVERED
DELIVERED ──> (terminal; RETURNED optional)
CANCELLED / REJECTED ──> (terminal)
```

```js
// D6: admin ka column khaali hai — admin sirf dekh sakta hai
const ALLOWED_TRANSITIONS = {
  INITIATED:        { vendor: [],                      user: [],            admin: [] },
  PENDING:          { vendor: ["ACCEPTED","REJECTED"], user: ["CANCELLED"], admin: [] },
  ACCEPTED:         { vendor: ["PACKED","REJECTED"],   user: ["CANCELLED"], admin: [] },
  PACKED:           { vendor: ["OUT_FOR_DELIVERY"],    user: [],            admin: [] },
  OUT_FOR_DELIVERY: { vendor: ["DELIVERED"],           user: [],            admin: [] },
  DELIVERED:        { vendor: [],                      user: [],            admin: [] },
  CANCELLED:        { vendor: [], user: [], admin: [] },
  REJECTED:         { vendor: [], user: [], admin: [] },
};
```
Har transition pe: stock adjust (REJECTED/CANCELLED pe wapas), `statusHistory` push, notification.

> **D5 ki wajah se `INITIATED` state ab dead hai.** COD-only me order seedha `PENDING` banega (aaj bhi COD branch yahi karta hai). `INITIATED` enum me rahega taaki purane docs valid rahein, par naya order kabhi INITIATED nahi banega. Prod me abhi bhi 0 INITIATED orders hain — 49 DELIVERED + 27 CANCELLED, bas.

> **D6 pe ek note:** admin ke paas koi override nahi hai, matlab agar vendor ek order pe kuch na kare to wo order hamesha `PENDING` me atka rahega. Do options — (a) aise hi rehne do, admin vendor ko phone karega; (b) ek auto-cancel job (X din PENDING → CANCELLED). Abhi (a) maan ke chal raha hoon, aap bolein to (b) add kar dunga.

### 5.6 Auth — role escalation band karo 🔴

Aaj `POST /auth/register` public hai aur body se `role` uthata hai ([register.js:12](../controllers/auth/register.js#L12)). Koi bhi `{"role":"admin"}` bhej ke admin ban sakta hai.

```js
// register.js — fix
role = ROLES.USER;   // hardcode. public register sirf customer banaega.
```
Vendor sirf `POST /vendors/create` (isAdmin) se banega. Admin seed script / env se.

---

## 6. Delivery & distance calculation

### Rule (D10 — aapke spec ke mutabik)
```
pickup  = vendor ka DEFAULT branch  (Location: userId=vendorId, type=VENDOR_BRANCH, isDefault=true)
drop    = customer ka selected Location
distance = haversine(pickup.coordinates, drop.coordinates)
```

Vendor ke **multiple branch ho sakte hain**, par distance aur delivery charge **hamesha `isDefault` wale se hi** calculate honge. Baaki branches sirf record ke liye hain (aur `VendorServiceArea.locationId` unhe point kar sakta hai, par wo abhi distance me use nahi hoga).

**Single-default invariant — ye enforce karna zaroori hai:**
```js
// branch ko default set karte waqt, ek transaction me:
await Location.updateMany(
  { userId: vendorId, type: "VENDOR_BRANCH", isDeleted: false },
  { $set: { isDefault: false } }, { session },
);
await Location.updateOne(
  { _id: locationId, userId: vendorId, type: "VENDOR_BRANCH", isDeleted: false },
  { $set: { isDefault: true } }, { session },
);
```
Aur: vendor create karte waqt **pehla branch automatically `isDefault: true`** ho — warna order kabhi place hi nahi hoga.

> ⚠️ **Prod me abhi 143/143 locations pe `isDefault: false` hai** (M2). Migration me ye set karna **mandatory** hai.

`placeOrder` me replacement:
```js
// PURANA: global Setting.delivery.shopLocationId → SHOP_ADDRESS constant fallback
// NAYA:
const profile = await VendorProfile.findOne({ vendorId: cart.vendorId }).lean();
const pickup  = await Location.findOne({
  _id: profile?.defaultLocationId,
  userId: cart.vendorId,
  type: LOCATION_TYPES.VENDOR_BRANCH,
  isDeleted: false,
}).lean();

if (!pickup || !isValidCoords(pickup.coordinates)) {
  throwError(503, "Vendor pickup location not configured", "VENDOR_PICKUP_MISSING");
}

const distanceKm = calculateDistanceInKm(
  pickup.coordinates[0], pickup.coordinates[1],      // [lat, lng]
  userLocation.coordinates[0], userLocation.coordinates[1],
);

// D4 — per-vendor config, global Setting fallback
// merge order: hardcoded DELIVERY_SETTINGS → global Setting.delivery → VendorProfile.delivery
const deliveryConf = {
  ...toCamelDefaults(DELIVERY_SETTINGS),
  ...pruneUndefined(globalSetting?.delivery),
  ...pruneUndefined(profile?.delivery),
  ...pruneUndefined({ deliveryChargeOverride: area?.deliveryChargeOverride,
                      freeDeliveryAbove:      area?.freeDeliveryAbove }),
};

if (distanceKm > deliveryConf.maxRadiusKm) {
  throwError(400, `Delivery not available beyond ${deliveryConf.maxRadiusKm} km`, "OUT_OF_RADIUS");
}

// min order amount check
if (deliveryConf.minOrderAmount && cart.subTotal < deliveryConf.minOrderAmount) {
  throwError(400, `Minimum order amount is ₹${deliveryConf.minOrderAmount}`, "MIN_ORDER_NOT_MET");
}

let deliveryCharge = deliveryConf.deliveryChargeOverride ??
  calculateDeliveryCharges(cart.totalWeight, distanceKm, deliveryConf);

// free delivery above X
if (deliveryConf.freeDeliveryAbove && cart.subTotal >= deliveryConf.freeDeliveryAbove) {
  deliveryCharge = 0;
}

const payableAmount = cart.subTotal + deliveryCharge;   // ← ab 0 hardcoded nahi
```

**Charge preview API bhi chahiye** — customer ko checkout se *pehle* pata chale:

`POST /orders/preview { locationId }` → `{ subTotal, distanceKm, deliveryCharge, payableAmount, freeDeliveryAbove, etaMinutes }`

Ye `placeOrder` ka hi read-only version hai (same calculation, koi write nahi). Warna customer ko "Place Order" dabane ke baad total badal jaane ka surprise milega. **Calculation ek hi helper me rakho** (`computeOrderPricing()`) jise preview aur placeOrder dono call karein — do jagah likha to kal ko mismatch hoga.

### Edge cases jo handle karne hain

1. **Vendor ka default branch set hi nahi** → order block, `503 VENDOR_PICKUP_MISSING`. Admin ko alert. (Isliye vendor create karte waqt pehla branch automatically `isDefault: true` ho.)
2. **Coordinates `[0,0]`** → invalid treat karo (aaj `placeOrder` customer ke liye ye check karta hai, vendor ke liye chupchaap `SHOP_ADDRESS` constant pe fallback ho jaata hai — wo hata do).
3. **Pincode serve hota hai par distance > maxRadiusKm** → ye contradiction hai. Vendor ne pincode add kiya lekin wo radius se bahar hai. Do options:
   - (a) `VendorServiceArea` ko authority maano, radius check skip karo
   - (b) Service area add karte waqt hi warn karo ki ye pincode branch se X km door hai
   **Recommendation:** (a) + service-area create pe advisory warning. Pincode explicit hai, radius heuristic hai — explicit jeetna chahiye.
4. **Haversine ≠ road distance.** Straight-line hai. Delivery charge under-estimate hoga (typically road = 1.3–1.4× crow-fly). Ya to `distanceFactor` ~1.4 lagao, ya Phase 7 me Google Distance Matrix. `DELIVERY_SETTINGS.DISTANCE_FACTOR` constant already hai par kahin use nahi ho raha.
5. **Delivery charge ab ON hoga (D4).** Aaj `deliveryCharge: 0` aur `payableAmount: cart.subTotal` hardcoded hai ([placeOrder.js:111](../services/orders/placeOrder.js#L111)) — hata dena hai. Config precedence: `VendorProfile.delivery` > `Setting.delivery` > `DELIVERY_SETTINGS` constant. `VendorServiceArea` pe per-pincode override bhi allowed.
6. **`calculateDeliveryCharges` ka `??` bug** — `Number(undefined) ?? DEFAULT` → `NaN` return karta hai (`??` sirf null/undefined pe fallback karta hai, NaN pe nahi). Agar `Setting` document nahi hai to poora charge `NaN` ho jaayega. Fix: `Number(x ?? DEFAULT)` ya `Number.isFinite()` check. Same bug `maxRadiusKm` pe bhi ([placeOrder.js:91](../services/orders/placeOrder.js#L91)).

---

## 7. Notifications

Aaj `sendSingleNotification(userId, ...)` `userId` **ignore** karta hai aur hamesha admin ko bhejta hai ([sendSingleNotification.js:37](../helpers/notifications/sendSingleNotification.js#L37)). Aur agar admin ka `fcmToken` nahi hai to **throw** karta hai — jo `verifyPayment` me try/catch ke bahar hai, matlab payment verify hone ke baad bhi API 400 de sakta hai.

Naya contract:

```js
sendNotification({ toUserId, title, body, type, data })   // ek banda
sendNotificationToMany({ toUserIds, ... })                // bulk (multicast)
```
- FCM token missing → chup-chaap skip karo (log), throw **kabhi nahi**
- Har notification call `try/catch` me, business transaction ke **bahar**

Notification matrix:

| Event | Customer | Vendor | Admin |
|---|---|---|---|
| Order placed (COD) | ✅ "Order placed" | ✅ **"New order #123"** ← sabse zaroori | ✅ (optional) |
| Vendor accepted | ✅ | — | — |
| Vendor rejected | ✅ + reason | — | ✅ |
| Packed / Out for delivery | ✅ | — | — |
| Delivered | ✅ | ✅ | — |
| Customer cancelled | ✅ | ✅ | — |
| Low stock (Phase 6) | — | ✅ | — |

> Aaj **saari notifications admin ko jaati hain** aur vendor ko kuch nahi. D5 (COD-only) ke baad "New order" notification hi poora vendor workflow trigger karti hai — isliye Phase 5 me ye sabse critical piece hai. Vendor ka `fcmToken` set hona zaroori hai (login pe aata hai).

Phase 6 me `Notification` model (in-app bell icon + history) — abhi sirf push hai, koi record nahi.

---

## 8. Phase plan

### Phase 0 — Security & bug hardening — ✅ **DONE (2026-09-13)**

Verification: `node scripts/verify-phase0.js` → **68/68 pass**

- [x] `/auth/register` se `role` hatao — hamesha `USER`
- [x] 🔴 **`/auth/loginOrSignin-with-mobile` + `-with-email` + dono `verify-otp` se bhi `role` hatao** — ye `register` se bhi bada hole tha: `{"mobile":"…","role":"admin"}` bhejo, account ban jaata tha, phir verify-otp se **admin token** mil jaata tha
- [x] `loginOrSignIn*` me `User.create` pe missing `await` — isi se prod me duplicate users bane (8088684570, 26ms apart)
- [x] 🔴 `GET /users/getAll` pe `isAdmin` — pehle koi bhi customer 1452 users ki list (naam/email/mobile) nikal sakta tha
- [x] 🔴 `GET /users/get?userId=` — ab sirf admin
- [x] 🔴 `GET /locations/getAll` + `get/:id` scoping — pehle koi bhi sabke addresses padh sakta tha
- [x] `orders/getAll` + `get/:id` role scoping (`assertOrderAccess.js`)
- [x] `updateOrder` field whitelist (`status`, `paymentStatus` only)
- [x] `createLocation` — `userId` sirf admin, single-default invariant, `user.locationId` ab sirf default pe
- [x] `deleteLocation` role check fix
- [x] `removeItem` ka stock-inflation bug
- [x] `calculateDeliveryCharges` + `maxRadiusKm` ka `Number() ??` NaN bug
- [x] Category/SubCategory/Product — ownership checks + vendor-scoped uniqueness
- [x] `createProduct` — owner ab token se, `subCategory.userId` se nahi
- [x] `updateProduct` — implicit global `updatedSubCategory`, aur merged-value duplicate check (pehle sirf `name` bhejne pe jhootha 409 aata tha)
- [x] `isActive` toggle → **set** (category + subcategory) — pehle client jo bhejta tha uska ulta hota tha
- [x] `ERROR_CODES` / `ORDER_STATUS` / `LOCATION_TYPES` constants + error `code` end-to-end
- [x] Performance indexes (unique wale Phase 1 me — abhi `userId` null hai)
- [x] Purana galat `location_2dsphere` index schema se hataya *(prod se drop Phase 1 migration me)*
- [x] 3 routes unmount: `verify-payment`, `update/remove-product-locations`

**Baaki (Phase 1 me, migration ke baad):**
- [ ] `{email, role}` + `{mobile, role}` partial-unique index — pehle duplicate mobile clean karna hai
- [ ] Duplicate mobile `8088684570` ke dono users delete (D17) — index se pehle
- [ ] Prod se `locations.location_2dsphere` index drop

### Phase 1 — Vendor foundation — ✅ **CODE DONE (2026-09-13)**

Verification: `node scripts/verify-phase1.js` → **78/78 pass**
Migration dry run: `node scripts/migrateToVendorModel.js` → plan §11 se exactly match

- [x] `VendorProfile`, `VendorServiceArea` models + constants
- [x] **`VendorServiceArea.zipcode` pe global unique partial index (D1)** + `E11000` → `409 PINCODE_ALREADY_ASSIGNED` mapping `errorHandler` me
- [x] `POST /vendors/create` — User + VendorProfile + pehla branch, ek `session` transaction me
- [x] Branch create/list + `setDefaultBranch` (single-default invariant, coords validation)
- [x] Service area bulk add — **all-or-nothing**, conflict pe 409 with `shopName`
- [x] `GET /service-areas/lookup` + `PUT /service-areas/reassign` (atomic transfer)
- [x] `GET /service-areas/check` (customer-facing)
- [x] `Location.type` (CUSTOMER / VENDOR_BRANCH) + `geo` (2dsphere reserve)
- [x] `pagination()` me `throwOnEmpty` option (Phase 2 ko chahiye)
- [x] **`utils/ttlCache.js`** — `zipcode → vendor` cache, Redis-swappable interface
- [x] Cache invalidation — service area add/remove/reassign, vendor update/status, branch default change
- [x] **`scripts/migrateToVendorModel.js`** — dry-run default, idempotent, `--apply` se writes, built-in verify

**Scalability notes:**
- Har listing request ka `zipcode → vendor` lookup ab **cached** hai (5 min TTL, negative caching bhi) — ek pincode pe hazaron users, ek hi DB hit
- D1 ki wajah se product filter **equality match** hai (`userId: <one vendor>`), `$in` scan nahi
- `resolveServiceContext` array shape (`vendorIds`) return karta hai — multi-vendor pe jaana ho to sirf wahi ek file badlegi
- Vendor counts `$lookup` se aate hain; vendors ki sankhya chhoti rehti hai. Hazaron vendors hue to counts denormalize karne padenge

### Phase 2 — Location-aware catalog — ✅ **DONE** *(41/41 pass)*
- [x] `resolveServiceContext` + `attachServiceContext` middleware
- [x] `getAllCategories` / `getAllSubCategories` / `getAllProducts` — `(query, serviceContext)`
- [x] `applyServiceScope` shared helper — scope hamesha match ke **aakhir me** lagta hai, taaki client ka `?userId=` override na kar sake
- [x] `getProduct` / `getCategoryById` / `getSubCategoryById` pe serviceability check
- [x] `pagination()` me `throwOnEmpty`; customer listing pe empty = `200`
- [x] Validators me `zipcode` / `locationId` / `vendorId` params
- [x] Customer ke liye `isOutOfStock` products bhi hide

### Phase 3 — Vendor-locked cart — ✅ **DONE** *(47/47 pass)*
- [x] `Cart.vendorId`, `deliveryZipcode`, `verifiedAt` + `409 CART_VENDOR_CONFLICT` + `?replaceCart=true`
- [x] `verifyCartByPincode` → `VendorServiceArea` + `Product` (D3), `locationId` ya `zipcode` dono accept
- [x] `getCart` ka price-overwrite bug fix — ab price badle to `verifiedAt` reset hota hai
- [x] `removeItem` ka stock-mutation bug fix
- [x] `recalcCartTotals` — teen jagah ka alag-alag calculation ek jagah aaya
- [x] N+1 fix (per-item `findOne` → ek `$in` query)
- [x] Cart routes `isUser` pe tighten; `carts/get` ka `?userId=` IDOR fix
- [x] Cart me sirf serving vendor ka product add ho (defence in depth)

### Phase 4 — Vendor-scoped checkout — ✅ **DONE** *(102/102 with Phase 5)*
- [x] `Order.vendorId`, `vendorLocationId`, `orderNumber`, `statusHistory`, `productSnapshot`, `assignedTo`
- [x] `items[].locationId` hataya (Q28)
- [x] `computeOrderPricing()` — preview aur placeOrder **dono** yahi call karte hain
- [x] `POST /orders/preview`
- [x] Pickup = vendor default branch (D10); radius global `Setting` se (D15)
- [x] Delivery charge sirf vendor config se; khali → ₹0 (D15) + `freeDeliveryAbove` + `minOrderAmount`
- [x] Stock reserve sirf `Product` pe, transaction me guarded `$inc`
- [x] `orderNumber` — atomic `Counter` collection se (timestamp+random nahi, collision-free)
- [x] `CART_NOT_VERIFIED` gate + verified-zipcode vs order-address match

### Phase 5 — Vendor order management — ✅ **DONE**
- [x] `PUT /orders/:id/status` + state machine + ownership (`isVendor` only — D6)
- [x] `PUT /orders/:id/cancel` (customer, PENDING/ACCEPTED tak)
- [x] `GET /orders/vendor/summary` + `GET /orders/admin/summary` (read-only)
- [x] Purana blanket `PUT /orders/update/:id` route hataya
- [x] Notification rewrite — recipient-aware, **non-throwing**, lazy Firebase init
- [x] Reject/cancel pe stock restore (transaction me)
- [x] `orderAggregation` me vendor + pickup location + statusHistory

### Phase 6 — Admin oversight *(3–4 din)*
- [ ] Admin **read-only** dashboard APIs (vendor-wise orders, revenue, top products) — D6
- [ ] Commission tracking + `Settlement` model (COD me vendor khud paisa collect karta hai, platform ka cut manually settle hoga)
- [ ] Per-vendor banners
- [ ] `Notification` model (in-app history)
- [ ] Vendor-wise reports / CSV export
- [ ] *(Optional Q20)* PENDING orders ke liye auto-cancel job

### Phase 7 — Scale & polish *(ongoing)*
- [ ] `resolveServiceContext` pe Redis cache (`sa:<zipcode>` → vendorId; D1 ki wajah se ye ek simple string cache hai)
- [ ] GeoJSON + `$near` se "nearest branch" pickup (Q5-b pe switch)
- [ ] Google Distance Matrix (road distance)
- [ ] `ProductLocation` revive — per-branch price/stock (agar D3 badle)
- [ ] **Online payment enable** (D5 reverse) — tab `verifyPayment` ka `"PAID"` bug, stock-lock, aur refund flow chahiye
- [ ] Rider/staff role activate (D11 ke reserved fields use karke)
- [ ] Elasticsearch / Atlas Search agar product count badhe

> **Agar kabhi D1 (exclusive territory) badalna pade** — multi-vendor per pincode chahiye ho — to ye badlega: `VendorServiceArea` ka unique index drop, `resolveServiceContext` array return kare (services ko haath nahi lagega, wo already `$in` use kar rahe honge), aur cart/order ko split-order support chahiye hoga. Estimate ~2 hafte. Isliye abhi se `vendorIds` array shape rakh raha hoon.

---

## 9. Known issues — aaj ke code me (implementation se pehle)

### 🔴 Critical (security / data corruption)

| # | Issue | File | Asar |
|---|---|---|---|
| 1 | `/auth/register` body se `role` leta hai | [register.js:12](../controllers/auth/register.js#L12) | Koi bhi admin/vendor ban sakta hai |
| 2 | `update-product-locations` / `remove-product-locations` pe **koi auth nahi** (middleware comment kiya hua) | [products.js:21-30](../routes/products.js#L21-L30) | Anonymous user kisi bhi product ka price/stock badal de |
| 3 | `orders/getAll` pe koi user scoping nahi | [getAllOrders.js:36](../services/orders/getAllOrders.js#L36) | Koi bhi logged-in user sabke orders, naam, mobile, address dekh le |
| 4 | `orders/get/:id` pe ownership check nahi | [getOrder.js:6](../services/orders/getOrder.js#L6) | Same leak, IDOR |
| 5 | `createLocation` client ka `userId` accept karta hai + us user ka `locationId` overwrite karta hai | [createLocation.js:25,74](../services/locations/createLocation.js#L25) | User B ke account me address inject, default address hijack |
| 6 | `createProduct` `subCategory.userId` use karta hai token ke `userId` ke bajaye | [createProduct.js:46](../services/products/createProduct.js#L46) | Vendor A, Vendor B ki subcategory me product bana de — product B ka ho jaayega |
| 7 | `updateOrder` payload ke **saare** fields blindly set karta hai | [updateOrder.js:11-13](../services/orders/updateOrder.js#L11-L13) | `payableAmount`, `paymentStatus` kuch bhi set ho sakta hai |

### 🟠 High (business logic toot-ti hai)

| # | Issue | File | Asar |
|---|---|---|---|
| 8 | `verifyPayment` `status = "PAID"` set karta hai — enum me hai hi nahi | [verifyPayment.js:49](../services/orders/verifyPayment.js#L49) | Payment success ke baad `save()` ValidationError, transaction abort, **customer ka paisa kat gaya par order nahi bana** |
| 9 | Stock decrement `locationId` filter ke bina | [verifyPayment.js:35-42](../services/orders/verifyPayment.js#L35-L42), [placeOrder.js:151](../services/orders/placeOrder.js#L151) | Galat branch ka stock ghata, multi-vendor me aur bigda |
| 10 | `removeItem` cart se hatate waqt `Product.stockQuantity` **badha** deta hai, jabki add pe kabhi ghataya hi nahi | [removeItem.js:25,29](../services/carts/removeItem.js#L25) | Stock infinitely inflate |
| 11 | `getCart` verified price ko `generalPrice` se overwrite kar deta hai | [getCart.js:38](../services/carts/getCart.js#L38) | `verify-delivery` ke baad price palat jaata hai, checkout pe mismatch |
| 12 | `Category` name uniqueness **global** | [createCategory.js:9](../services/categories/createCategory.js#L9) | Doosra vendor "Rice" category nahi bana sakta |
| 13 | `Product` duplicate check **global** (name+brand+subCat+type+weight) | [createProduct.js:31](../services/products/createProduct.js#L31) | Do vendor same product nahi bech sakte |
| 14 | `calculateDeliveryCharges` me `Number(undefined) ?? DEFAULT` → `NaN` | [calculateDeliveryCharges.js:11-16](../helpers/orders/calculateDeliveryCharges.js#L11-L16) | `Setting` doc na ho to charge `NaN` |
| 15 | `deliveryCharge: 0` hardcoded, `payableAmount = subTotal` | [placeOrder.js:111-113](../services/orders/placeOrder.js#L111-L113) | Delivery ka paisa kabhi charge hi nahi hota |
| 16 | `Order.deliveryPincode` kabhi set nahi hota | [placeOrder.js:101](../services/orders/placeOrder.js#L101) | Filter/search/reporting me khaali |
| 17 | `sendSingleNotification` `userId` ignore karke hamesha admin ko bhejta hai, aur token missing pe **throw** karta hai | [sendSingleNotification.js:37-40](../helpers/notifications/sendSingleNotification.js#L37-L40) | Customer/vendor ko kabhi notification nahi; admin ka token na ho to payment verify API fail |

### 🟡 Medium

| # | Issue | File |
|---|---|---|
| 18 | `Location` ka `2dsphere` index `location` field pe hai jo exist hi nahi karta | [Location.js:37](../models/Location.js#L37) |
| 19 | `coordinates` `[lat,lng]` hai par validator message `[lng,lat]` bolta hai | [locations.js:22](../validator/locations.js#L22) |
| 20 | `deleteLocation` me `userRole` ek Mongoose doc hai, `ROLES.ADMIN` string se compare | [deleteLocation.js:11-16](../services/locations/deleteLocation.js#L11-L16) |
| 21 | `pagination()` khaali result pe hamesha 404 | [pagination.js:29](../utils/pagination.js#L29) |
| 22 | `Cart` pre-save empty pe `isDeleted` set karta hai par `totalWeight`/`totalQuantity` reset nahi karta | [Cart.js:59](../models/Cart.js#L59) |
| 23 | `Product.stockQuantity` vs `ProductLocation.stockQuantity` — dual source of truth | — |
| 24 | `updateLocation.js` khaali file hai, route bhi comment out | [updateLocation.js](../services/locations/updateLocation.js) |
| 25 | Cart items pe `resolvedPincode` ka koi TTL nahi — kal ka verified cart aaj bhi "verified" |  |
| 26 | `addOrUpdateItem` har call pe poore cart ke liye per-item `Product.findOne()` chalata hai (N+1) | [addOrUpdateItems.js:41](../services/carts/addOrUpdateItems.js#L41) |
| 27 | `carts.js` / `orders.js` routes me `isAdmin` import hai par use nahi | [carts.js:4](../routes/carts.js#L4) |
| 28 | `services/auth/registerUser.js` khaali file | — |

---

## 10. Questions

### ✅ Answered (2026-09-13)

| # | Question | Jawab |
|---|---|---|
| **Q1** | Ek pincode pe kitne vendor? | **Ek hi vendor — exclusive territory.** Doosre vendor ko wahi pincode dene pe `409 PINCODE_ALREADY_ASSIGNED` (kis shop ka hai wo bhi batayega). DB unique index + app-level check, dono. → §4.1 |
| **Q2** | Cart me multi-vendor? | **Nahi — ek cart = ek vendor.** `409 CART_VENDOR_CONFLICT` + `?replaceCart=true`. → §5.4 |
| **Q3** | Price/Stock kahan? | **Sirf `Product` pe** (vendor level). `ProductLocation` read/write path se hat jaayega. → §4.7 |
| **Q6** | Delivery charge? | **ON — per-vendor config** (`VendorProfile.delivery`), global `Setting` fallback, per-pincode override + "free above ₹X" bhi. Preview API bhi banegi. → §6 |

| **Q4** | Category/SubCategory per-vendor ya global? | **Per-vendor** (aaj ka code). Uniqueness `{userId, name}` pe scope hogi. → §4.4 |
| **Q5** | Pickup point kaun sa? | **Vendor ka `isDefault` branch** (D10). → §6 |
| **Q7** | Payment? | **Sirf COD (D5).** Razorpay/ONLINE route band. Prod me 0 online orders + 0 transactions — data bhi yahi kehta hai |
| **Q8** | Admin order pe action? | **Nahi — sirf dekh sakta hai (D6).** `PUT /orders/:id/status` sirf vendor ke liye |
| **Q9** | Guest browsing? | **Nahi — login mandatory (D7)** |
| **Q11** | Vendor khud branch/service area manage kare? | **Nahi — sirf admin (D8).** Vendor change ke liye admin ko request karega |
| **Q12** | Rider/staff role? | **Abhi nahi.** `Order.assignedTo` + `assignedAt` field reserve kar di (D11), koi logic nahi |
| **Q13** | Shop closed? | **Concept hi nahi (D9).** Order 24×7, vendor kabhi bhi deliver karega |
| **Q14** | Vendor ke kitne branch? | **Multiple ho sakte hain**, par distance hamesha `isDefault` wale se (D10) |

| **Q10** | Default vendor kaun? | **Nagraj Mart** — `nagraj@gmail.com`, `8210574144`, password diya gaya (D12) |
| **Q15** | Vendor branch ka address? | **`Setting.delivery.shopLocationId`** wala (577001, `[14.464, 75.922]`) — wahi pickup point (D12) |
| **Q16** | 577006 ka galat coordinate? | **`[14.464, 75.92]`** kar dena hai |
| **Q17** | Price kaunsa? | **ProductLocation wala** (D13) — impact sirf `bell` pe |
| **Q18** | 215 carts? | **Clear** — `isDeleted: true` + `items: []` (D14) |
| **Q19** | Duplicate mobile `8088684570`? | **Dono delete** (D17) |
| **Q20** | Order PENDING me atak jaye? | **Rehne do** — vendor khud karega. Auto-cancel job baad me |
| **Q21** | App + backend saath deploy? | **Haan** (D18) — grace mode ki zaroorat nahi |
| **Q22** | Delivery charge kab se? | **Vendor config se hi**, config khali → ₹0 (D15) |
| **Q23** | Stock kaunsa? | **Live PL ka minimum** (D13) |
| **Q24** | Khali categories? | **Kuch mat karo** — vendor khud clean karega |
| **Q25** | `bell` product? | **₹1100** aur sabhi 6 pincodes pe available |
| **Q26** | `maxRadiusKm`? | **Global `Setting` ka 50km safety ke liye rahega** (D15) |
| **Q27** | Stock ek godown ka? | **Haan** — vendor level pe ek hi stock |
| **Q28** | `Order.items[].locationId`? | **Hata do** — DB me 0/76 me set hai, koi data loss nahi |

### ⬜ Abhi bhi open

*(Koi blocking question baaki nahi hai — implementation chalu hai.)*

---

## 11. Migration plan

Phase 1 ke saath ek script — `scripts/migrateToVendorModel.js`:

Prod data ke actual numbers ke saath (§2.1 dekho):

```
 1. VENDOR BANAO                                              ← Q10 blocking
      User { role: "vendor", name/email/mobile, password }
      VendorProfile { vendorId, shopName, defaultLocationId, delivery, commissionPercent }
      Expected: 1 naya user (abhi 0 vendors hain)

 2. VENDOR BRANCH                                             ← Q15
      Setting.delivery.shopLocationId (= 6a1e790c…249e, 577001, [14.464,75.922])
      ko VENDOR_BRANCH bana do, userId = naya vendor, isDefault: true
      ⚠️ M2: abhi 143/143 locations pe isDefault=false hai — ye step MANDATORY

 3. SERVICE AREAS — 6 rows                                    ← ✅ dedupe ki zaroorat nahi
      Location.find({ isProductAddress: true, isDeleted: false })  → 6 docs
      zipcodes: 577001, 577002, 577003, 577004, 577005, 577006
      har ek → VendorServiceArea { vendorId, locationId: <default branch>, zipcode, ... }
      ✅ verified: koi duplicate active zipcode nahi → unique index clean banega
      ⚠️ Q16: 577006 wale ka coords [13.97668, 75.82694] galat lagta hai — confirm karo

 4. LOCATION.type BACKFILL — 143 docs
      isProductAddress === true (8 docs)  → "VENDOR_BRANCH", userId = vendor
      baaki (135 docs)                    → "CUSTOMER"
      Customer ka default: har user ke latest address pe isDefault = true
        (96 users ke paas address hai; 1356 ke paas koi nahi)

 5. CATALOG userId BACKFILL — 132 docs                        ← 🔴 M1, sabse important
      categories     17 docs  (sab userId: undefined)
      subcategories  25 docs  (sab userId: undefined)
      products       90 docs  (sab userId: undefined)
      → sab pe userId = naya vendor
      ⚠️ Ye step skip hua to Phase 2 ke baad HAR customer ko empty catalog milega

 6. CARTS — 215 active non-empty                              ← Q18
      Option A (safe): isDeleted = true kar do, users dobara add karenge
      Option B: vendorId = default vendor backfill

 7. ORDERS — 76 docs
      vendorId        = default vendor (sab ek hi vendor ke hain)
      deliveryPincode = uske locationId wale Location ka zipcode   ← M10 (abhi 0/76)
      vendorLocationId = default branch
      statusHistory   = [{ status: <current>, at: updatedAt }]  (seed entry)

 8. PRE-INDEX CLEANUP
      ⚠️ M5: duplicate mobile 8088684570 (2 users) resolve karo    ← Q19
      M7: 27 duplicate SKUs deleted products me hain → partial index se bach jayenge

 9. INDEXES CREATE (background: true)                         ← M9, abhi lagbhag zero hain
      users: email/mobile partial-unique
      categories/subcategories/products: userId compound + scoped unique
      vendorserviceareas: zipcode UNIQUE (D1)
      orders: { vendorId, status, createdAt }, { userId, createdAt }
      locations: { userId, type, isDefault }, { zipcode }

10. DROP karo: locations.location_2dsphere                    ← bekaar index,
      "location" field DB me exist hi nahi karta (sample docs me confirm kiya)
```

**Safety:**
- Script **idempotent** ho (dobara chale to kuch na bigde) — har step pe "already migrated?" check
- `--dry-run` **default** ho; likhne ke liye explicit `--apply` chahiye
- Chalane se pehle **`mongodump`** (2705 docs hain, 2 minute ka kaam)
- **Stage DB pe pehle** chalao — `.env` me `NvsRiceMart-StageDB` ka URL already commented pada hai
- Har step ke baad count verify: step 5 ke baad `products.countDocuments({ userId: null })` **0** hona chahiye
- Rollback plan: `mongorestore`. Soft rollback ke liye har migrated doc pe `_migratedAt` field bhi daal sakte hain

---

## 12. Scale ke liye kya dhyan rakhna hai

| Concern | Solution |
|---|---|
| `resolveServiceContext` har listing call pe 2-3 query karta hai | Redis cache: `sa:<zipcode>` → `{ vendorId, shopName, locationId }`. D1 ki wajah se ye ek chhota fixed-size entry hai. TTL 5-10 min; service-area add/remove/reassign aur vendor suspend pe invalidate |
| Product listing pe `userId` filter | Compound index `{ userId: 1, isDeleted: 1, isActive: 1, createdAt: -1 }`. D1 ki wajah se ye **equality match** hai (`$in` of 1) — sabse fast case |
| `pagination()` ka `$facet` bade collection pe slow | `totalCount` ko approximate karo ya alag cached count. 100k+ products pe matter karega |
| Search abhi `$regex` hai (index use nahi hota) | Text index → Atlas Search (Phase 7) |
| Vendor dashboard queries | `{ vendorId: 1, status: 1, createdAt: -1 }` index; dashboard counts ko 1-min cache |
| FCM notifications sync bhejte hain | Queue (BullMQ) — order ka response notification pe block na ho |
| Stock race condition | Hamesha `updateOne({ _id, stockQuantity: { $gte: qty } }, { $inc: { stockQuantity: -qty } })` + `modifiedCount` check (aaj ka pattern sahi hai, bas `Product` pe shift karna hai) |
| `Setting` document har order pe fetch hota hai | In-memory cache with TTL |

---

## 13. Testing checklist (Phase 2 ke baad zaroor)

```
── Serviceability ─────────────────────────────────────────────
[ ] Serviceable pincode ka customer   → sirf USI vendor ka catalog
[ ] Non-serviceable pincode           → 404 PINCODE_NOT_SERVICEABLE
[ ] Bina pincode ke customer          → 400 PINCODE_REQUIRED
[ ] Customer ?userId=<dusra vendor>   → ignore ho, apna hi scoped data mile
[ ] Serviceable pincode, 0 product    → 200 + empty data (404 NAHI)

── Exclusive territory (D1) ───────────────────────────────────
[ ] Vendor B ko vendor A ka pincode   → 409 PINCODE_ALREADY_ASSIGNED + shopName
[ ] Bulk me 1 conflict                → poora batch reject, kuch likha na ho
[ ] Do admin ek saath same pincode    → ek success, ek 409 (unique index)
[ ] Service area soft-delete          → wahi pincode doosre vendor ko mil jaye
[ ] Reassign API                      → purana soft-delete + naya create, atomic

── Roles ──────────────────────────────────────────────────────
[ ] Vendor login                      → sirf apna catalog + apne orders
[ ] Admin login                       → sab kuch
[ ] Public register role:"admin"      → user hi bane
[ ] Vendor suspend / isOpen:false     → uska catalog turant gayab (404)

── Cart & Order ───────────────────────────────────────────────
[ ] Cart me vendor A, phir vendor B   → 409 CART_VENDOR_CONFLICT
[ ] ?replaceCart=true                 → purana clear, naya bane
[ ] Address badla (dusra vendor area) → cart conflict wahin detect ho
[ ] Order place → vendorId + deliveryPincode + vendorLocationId sahi
[ ] Distance vendor ke default branch se (global SHOP_ADDRESS se nahi)
[ ] deliveryCharge > 0 aur payableAmount = subTotal + deliveryCharge
[ ] subTotal >= freeDeliveryAbove     → deliveryCharge 0
[ ] subTotal < minOrderAmount         → 400 MIN_ORDER_NOT_MET
[ ] /orders/preview ka total == actual order ka total
[ ] Vendor ka default branch set nahi → 503 VENDOR_PICKUP_MISSING
[ ] Vendor ke 2 branch, non-default pe close customer → distance FIR BHI default se (D10)
[ ] Vendor B, vendor A ka order dekhe → 403
[ ] Status transition illegal         → 422
[ ] Admin status change kare          → 403 (D6 — admin read-only)
[ ] paymentMethod:"ONLINE" bheja      → 422 (D5 — sirf COD)
[ ] /orders/verify-payment            → 404 (route unmounted)
[ ] Order reject/cancel               → Product.stockQuantity wapas
[ ] Bina token listing call           → 401 (D7 — guest nahi)

── Multi-tenant data ──────────────────────────────────────────
[ ] Do vendor same naam ki category   → dono ban jayein
[ ] Do vendor same product            → dono ban jayein
[ ] Vendor A, vendor B ki subCategory me product → 403
[ ] Stock race: 2 order, 1 stock      → ek success, ek 409 STOCK_UNAVAILABLE

── Migration verification (stage DB pe pehle) ─────────────────
[ ] products.countDocuments({ userId: null })       → 0
[ ] categories.countDocuments({ userId: null })     → 0
[ ] subcategories.countDocuments({ userId: null })  → 0
[ ] vendorserviceareas.countDocuments()             → 6
[ ] locations.countDocuments({ type: null })        → 0
[ ] locations.countDocuments({ type:"VENDOR_BRANCH", isDefault:true }) → 1
[ ] orders.countDocuments({ vendorId: null })       → 0
[ ] orders.countDocuments({ deliveryPincode: null })→ 0
[ ] 577001 ka customer login → 15 categories, 30 products dikhe
[ ] 577008 ka customer login → 404 PINCODE_NOT_SERVICEABLE
[ ] Bina address wala customer → 400 PINCODE_REQUIRED
[ ] Script dobara chalao → koi change nahi (idempotent)
```

---

## 14. Sign-off

| Item | Status |
|---|---|
| D1 — ek pincode = ek vendor (exclusive territory) | ✅ 2026-09-13 |
| D2 — ek cart = ek vendor | ✅ 2026-09-13 |
| D3 — price/stock sirf `Product` pe | ✅ 2026-09-13 |
| D4 — delivery charge ON, per-vendor config | ✅ 2026-09-13 |
| D5 — sirf COD, Razorpay nahi | ✅ 2026-09-13 |
| D6 — admin read-only | ✅ 2026-09-13 |
| D7 — login mandatory, guest nahi | ✅ 2026-09-13 |
| D8 — branch/service area sirf admin | ✅ 2026-09-13 |
| D9 — shop-closed concept nahi | ✅ 2026-09-13 |
| D10 — multiple branch, distance `isDefault` se | ✅ 2026-09-13 |
| D11 — `assignedTo`/`assignedAt` reserve | ✅ 2026-09-13 |
| Q4, Q5 — default recommendation maan li gayi | ✅ 2026-09-13 |
| Prod DB read-only inspection | ✅ 2026-09-13 (§2.1) |
| Section 3 ka resolution flow approve? | ⬜ |
| Section 4 ke naye models (`VendorServiceArea`, `VendorProfile`) approve? | ⬜ |
| Phase 0 (security fixes) sabse pehle — confirm? | ⬜ |
| **Q10 — default vendor ki details** 🔴 blocking | ⬜ |
| Q15–Q20 (prod data se nikle sawaal) | ⬜ |
