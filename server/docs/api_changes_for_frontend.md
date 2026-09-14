# NVS Rice Mart — API Changes for Frontend Teams

> **Audience:** App developer (customer app) · Vendor panel developer · Admin panel developer
> **Base URL:** `<host>/nvs-rice-mart`
> **Last updated:** 2026-09-14
> **Backend contact:** ye doc har phase ke saath update hoga

---

## 0. Kaise padhein

Har API pe ek status badge hai:

| Badge | Matlab |
|---|---|
| 🟢 **LIVE** | Deploy ho chuka hai — abhi integrate kar sakte ho |
| 🟡 **PLANNED** | Design final hai, backend ban raha hai — contract pe kaam shuru kar sakte ho, integrate deploy ke baad |
| 🔴 **BREAKING** | Existing behaviour badal gaya — **app/panel me change karna padega** |
| ⛔ **REMOVED** | Route hat gaya, ab 404 dega |

**Sabse pehle §2 (Breaking changes) padhein** — wo abhi live hai.

---

## 1. Global conventions

### 1.1 Auth header
```
Authorization: Bearer <jwt>
```
Token `POST /auth/login` ya `PUT /auth/verify-otp-mobile` se milta hai.

### 1.2 Success response — hamesha yahi shape
```json
{
  "success": true,
  "message": "Products fetched successfully",
  "data": { }
}
```

### 1.3 Error response
```json
{
  "success": false,
  "message": "We don't deliver to 110001 yet",
  "error": { "zipcode": "110001" },
  "code": "PINCODE_NOT_SERVICEABLE"
}
```

> 🔑 **`code` pe branch karo, `message` pe nahi.** `message` kabhi bhi badal sakta hai (translation, wording); `code` stable hai. `code` sirf un errors pe aata hai jinpe client ko kuch specific karna hai — baaki pe sirf `message` hota hai.

### 1.4 Paginated list response
```json
{
  "success": true,
  "message": "Products fetched successfully",
  "data": {
    "total": 30,
    "totalPages": 3,
    "page": 1,
    "limit": 10,
    "data": [ ... ]
  }
}
```
> ⚠️ `data.data` nested hai — ye existing shape hai, badla nahi hai.

### 1.5 Common query params (har `getAll` pe)
| Param | Type | Default |
|---|---|---|
| `page` | number | 1 |
| `limit` | number | 10 |
| `search` | string | — |
| `sortBy` | string | `createdAt` |
| `sortOrder` | `asc` \| `desc` | `desc` |
| `fromDate` / `toDate` | ISO date | — |

---

## 2. 🔴 BREAKING CHANGES — abhi LIVE hain (Phase 0)

Ye sab **already deploy ho raha hai**. Har team ye section zaroor padhe.

### 2.1 `role` ab request body se nahi liya jaata — **App team**

In endpoints me `role` field bheja ja raha tha; ab **poori tarah ignore** hota hai aur hamesha `user` banta hai:

| Endpoint | Pehle | Ab |
|---|---|---|
| `POST /auth/register` | `role` body se | hamesha `user` |
| `POST /auth/loginOrSignin-with-mobile` | `role` body se | hamesha `user` |
| `POST /auth/loginOrSignin-with-email` | `role` body se | hamesha `user` |
| `PUT /auth/verify-otp-mobile` | `role` body se | hamesha `user` |
| `PUT /auth/verify-otp-email` | `role` body se | hamesha `user` |

**Kyun:** body me `{"role": "admin"}` bhej ke koi bhi admin account bana leta tha aur agle step me admin token mil jaata tha.

**App me kya karna hai:** `role` bhejna band kar do (bhejoge to error nahi aayega, bas ignore hoga). Koi aur change nahi.

**Vendor/Admin login:** `POST /auth/login` se hi hoga, jahan `role` ab bhi chalta hai (sirf lookup ke liye — password verify hota hai, naya account nahi banta):
```json
POST /auth/login
{ "type": "email", "email": "nagraj@gmail.com", "password": "•••", "role": "vendor" }
```

---

### 2.2 `isActive` ab TOGGLE nahi, SET hota hai — 🔴 **Vendor/Admin panel**

| Endpoint | Pehle | Ab |
|---|---|---|
| `PUT /categories/update/:id` | `isActive` bheja → value **ulti** ho jaati thi | bheji hui value **set** hoti hai |
| `PUT /subCategories/update/:id` | wahi | wahi fix |

```jsonc
// Pehle: category active thi, aur aap `{"isActive": true}` bhejte the
//        → wo INACTIVE ho jaati thi (toggle)
// Ab:    `{"isActive": true}`  → active
//        `{"isActive": false}` → inactive
```

**Panel me kya karna hai:** agar aapne toggle behaviour ke hisaab se workaround banaya tha (ulta bhejna), wo **hata dijiye**. Ab seedha desired value bhejein.

---

### 2.3 Orders ab role ke hisaab se scope hote hain — **sab teams**

| Endpoint | Pehle | Ab |
|---|---|---|
| `GET /orders/getAll` | **har logged-in user ko SAARE orders** dikhte the | customer → sirf apne · vendor → sirf apne · admin → sab |
| `GET /orders/get/:id` | koi bhi kisi ka bhi order dekh sakta tha | apna nahi to `404` |

**App me:** ab `?userId=` bhejne ki zaroorat nahi — token se hi scope lag jaata hai. Bhejoge to ignore hoga.
**Admin panel me:** koi change nahi, admin ko sab dikhta rahega. Naye filters mile hain: `vendorId`, `orderNumber`.

---

### 2.4 Locations bhi scope ho gaye — **App team**

| Endpoint | Ab |
|---|---|
| `GET /locations/getAll` | customer/vendor → sirf apne addresses · admin → sab |
| `GET /locations/get/:id` | apna nahi to `404` |

Naya filter: `?isDefault=true` — customer ka default delivery address seedha nikalne ke liye.

---

### 2.5 Users APIs admin-only — **App team**

| Endpoint | Pehle | Ab |
|---|---|---|
| `GET /users/getAll` | koi bhi logged-in user poori list (naam/email/mobile) nikal sakta tha | **`403`** — sirf admin |
| `GET /users/get?userId=<kisi aur ka>` | kisi ka bhi profile | **`403`** — sirf admin |
| `GET /users/get` (bina param) | apna profile | ✅ same, koi change nahi |

**App me:** `GET /users/getAll` call kahin se hata do. `GET /users/get` bina `userId` ke hi call karo.

---

### 2.6 Order create — sirf COD, sirf customer

```jsonc
POST /orders/create          // 🔴 guard badla: ab sirf role=user
{
  "locationId": "6a9e50e1a359116c474ca8cb",
  "paymentMethod": "COD"     // 🔴 "ONLINE" ab 422 dega
}
```
- Admin/vendor ke token se order banane pe ab `403`
- `paymentMethod: "ONLINE"` → `422` `"Only Cash on Delivery (COD) is available right now"`

---

### 2.7 ⛔ REMOVED routes

| Route | Ab | Kyun |
|---|---|---|
| `POST /orders/verify-payment` | `404` | Online payment disabled (prod me 0 online orders the) |
| `PUT /orders/update/:id` | `404` | `PUT /orders/:id/status` ne replace kiya (vendor-only + state machine) |
| `PUT /products/update-product-locations/:productId` | `404` | Per-pincode price/stock khatam; **inpe koi auth tha hi nahi** |
| `DELETE /products/remove-product-locations/:productId` | `404` | wahi |

---

### 2.8 ⛔ `PUT /orders/update/:id` — **REMOVED** · 🔴 **Admin panel**

Ye route **hat gaya hai** (ab `404`). Pehle iske payload ka **koi bhi** field set ho jaata tha — `payableAmount`, `subTotal` sameth.

Replacement: **`PUT /orders/:id/status`** — sirf vendor ke liye, state machine ke saath (§9.3).

**Admin panel me kya karna hai:** order status change wala UI **read-only** kar dijiye. D6 ke mutabik ab sirf vendor hi order ka status badal sakta hai; admin dekh sakta hai, action nahi le sakta. Admin ke liye naya read-only endpoint hai: `GET /orders/admin/summary` (§9.6).

---

### 2.9 🆕 Address update + set-default — **App team**

Pehle customer apna address **edit nahi kar sakta tha** aur **default badal nahi sakta tha** (route comment out tha, service file khali thi). Ab:

```jsonc
PUT /locations/update/:id            // verifyJwtToken — apna hi address
{ "name": "home", "address": "...", "city": "...", "district": "...",
  "state": "...", "zipcode": "577004", "coordinates": [14.46, 75.92],
  "isDefault": true }                // sab optional, kam se kam ek zaroori

PUT /locations/set-default/:id       // sirf default badalne ke liye
200 { "message": "Default address updated", "data": { ...location } }
```
- Backend **single-default invariant** enforce karta hai — naya default set karte hi baaki apne aap `false` ho jaate hain, aur `user.locationId` bhi sync hota hai.
- Dusre ka address → `404` (existence leak na ho isliye 403 nahi).

**Aur:** default address **delete** karne pe backend apne aap doosra address default bana deta hai (warna customer ke paas address hote hue bhi `PINCODE_REQUIRED` aata).

### 2.10 🔴 `GET /settings/get` ab **admin-only** — **App team**

Pehle har logged-in user (customer bhi) ye padh sakta tha, aur populated shop address deta tha. Ab `403` non-admin ke liye.

Isme ab sirf **platform hard caps** hain — customer ke kisi kaam ke nahi:
```jsonc
{ "delivery": { "maxRadiusKm": 50, "maxAllowedDeliveryCharge": 200 } }
```
Delivery ka actual charge ab **per-vendor** hai. Customer ko jo dikhana hai wo `POST /orders/preview` se milta hai.

> **Admin panel:** purana delivery-pricing form (`baseCharge`, `perKmRate`, …) ab kuch nahi karta — wo fields vendor ke profile me chale gaye. Us form ko **platform limits** ke do fields tak chhota kar dijiye. `distanceFactor` / `weightFactor` hata diye gaye (wo kabhi use hi nahi hue the).

### 2.11 `POST /locations/create` — do behaviour changes

```jsonc
POST /locations/create
{
  "address": "12c vittal mandir road",
  "area": "maharaja pet",
  "city": "davangere",
  "district": "davangere",
  "state": "karnataka",
  "country": "india",          // optional, default "india"
  "zipcode": "577004",
  "coordinates": [14.4641, 75.9217],   // [latitude, longitude]
  "name": "home",              // optional
  "shopOrBuildingNumber": "12c", // optional
  "isDefault": true,           // 🆕 optional
  "userId": "..."              // 🔴 ab sirf ADMIN bhej sakta hai
}
```

1. 🔴 **`userId`** — apne alawa kisi aur ka bhejoge to `403`. (Pehle koi bhi doosre ke account me address daal sakta tha.)
2. 🆕 **`isDefault`** — pehla address **automatically default** banta hai. Baad me `isDefault: true` bhejo to wo default ban jaata hai aur baaki apne-aap `false` ho jaate hain (ek hi default rahega).

> ⚠️ **Coordinates ka order `[latitude, longitude]` hai** — `[14.4641, 75.9217]`. Purana validator message "[longitude, latitude]" kehta tha, wo **galat** tha.

---

## 3. Enums — ek hi jagah reference

```jsonc
ROLES            : "admin" | "staff" | "vendor" | "user"

ORDER_STATUS     : "INITIATED"          // legacy, naya order kabhi nahi banega
                 | "PENDING"            // vendor ke paas aa gaya
                 | "ACCEPTED"           // vendor ne accept kiya
                 | "PACKED"
                 | "OUT_FOR_DELIVERY"
                 | "DELIVERED"
                 | "CANCELLED"          // customer ne cancel kiya
                 | "REJECTED"           // vendor ne reject kiya
                 | "CONFIRMED"          // legacy, purane docs me hai

PAYMENT_METHODS  : "COD"                // naye orders me sirf yahi
                 | "ONLINE"             // legacy, purane orders ke liye

PAYMENT_STATUS   : "NOT_REQUIRED" | "INITIATED" | "SUCCESS" | "FAILED"

LOCATION_TYPES   : "CUSTOMER" | "VENDOR_BRANCH"      // Phase 1 se

VENDOR_STATUS    : "APPROVED" | "SUSPENDED"          // Phase 1 se

PRODUCT_TYPES    : "grocery" | "electronics" | "clothing"
```

---

## 4. Error codes — ek hi jagah reference

| `code` | HTTP | Kab | Client kya kare |
|---|---|---|---|
| `PINCODE_REQUIRED` | 400 | Customer ka koi delivery address hi nahi | "Delivery address add karein" screen |
| `PINCODE_NOT_SERVICEABLE` | 404 | Us pincode pe koi vendor nahi | "Hum yahan abhi deliver nahi karte" screen |
| `PINCODE_ALREADY_ASSIGNED` | 409 | Admin ne aisa pincode diya jo doosre vendor ke paas hai | Conflict list dikhao, reassign ka option do |
| `PRODUCT_NOT_AVAILABLE_HERE` | 404 | Product exist karta hai par is pincode pe nahi | "Ye item aapke area me available nahi" |
| `CART_VENDOR_CONFLICT` | 409 | Cart kisi aur vendor ka hai | "Cart clear karke aage badhein?" dialog |
| `VENDOR_NOT_SERVICEABLE` | 400 | Cart ka vendor is pincode pe deliver nahi karta | Address badalne ko kaho |
| `VENDOR_PICKUP_MISSING` | 503 | Vendor ka default branch set nahi | "Kuch gadbad hai, support se baat karein" |
| `STOCK_UNAVAILABLE` | 409 | Order place karte waqt stock khatam | Cart refresh karao |
| `OUT_OF_RADIUS` | 400 | Delivery distance limit se zyada | Address badalne ko kaho |
| `MIN_ORDER_NOT_MET` | 400 | Minimum order amount se kam | Kitna aur chahiye wo dikhao |
| `INVALID_STATUS_TRANSITION` | 422 | Vendor ne galat status change kiya | Button disable rakho |
| `CART_NOT_VERIFIED` | 400 | Checkout se pehle verify nahi hua | `verify-delivery` call karo |
| `FORBIDDEN` | 404/403 | Doosre ka resource | — |

---

## 5. 🟢 Phase 1 — Vendor onboarding · **Admin panel** — CODE READY

> Ye poora section **admin panel** ke liye hai. Vendor panel ko sirf read-only versions milenge.
> **Status:** backend implement ho chuka hai (`verify-phase1.js` 78/78). Deploy + migration ke baad live.

### 5.1 Vendor create
```jsonc
POST /vendors/create                                  // isAdmin
{
  "shopName": "Nagraj Mart",
  "name": "nagraj",
  "email": "nagraj@gmail.com",
  "mobile": "8210574144",
  "password": "•••••••",
  "legalName": "Nagraj Traders",       // optional
  "gstNumber": "29ABCDE1234F1Z5",      // optional
  "fssaiNumber": "12345678901234",     // optional
  "supportMobile": "8210574144",       // optional
  "commissionPercent": 0,              // optional
  "branch": {                          // pehla branch — REQUIRED
    "name": "main shop",
    "shopOrBuildingNumber": "12c",
    "address": "vittal mandir road",
    "area": "maharaja pet",
    "city": "davangere",
    "district": "davangere",
    "state": "karnataka",
    "country": "india",
    "zipcode": "577001",
    "coordinates": [14.464, 75.922]    // [lat, lng]
  }
}
```
```jsonc
201
{
  "success": true,
  "message": "Vendor created successfully",
  "data": {
    "vendor":  { "_id": "...", "name": "nagraj", "email": "...", "mobile": "...", "role": "vendor" },
    "profile": { "_id": "...", "shopName": "Nagraj Mart", "status": "APPROVED",
                 "defaultLocationId": "...", "delivery": {}, "commissionPercent": 0 },
    "branch":  { "_id": "...", "zipcode": "577001", "isDefault": true, "type": "VENDOR_BRANCH" }
  }
}
```
> Pehla branch **apne-aap `isDefault: true`** banta hai — yahi pickup point hai, isi ke lat/lng se delivery distance nikalti hai.

**Errors:** `422` validation · `409` email/mobile already exists

---

### 5.2 Vendor list / detail / update / status
```
GET  /vendors/getAll     // isAdmin
     ?page=1&limit=10&search=nagraj&status=APPROVED&zipcode=577004
     &shopName=nagraj&sortBy=createdAt&sortOrder=desc
GET  /vendors/get/:id    // isAdmin | isVendor(self)
PUT  /vendors/update/:id // isAdmin
PUT  /vendors/status/:id // isAdmin
```

`getAll` / `get` ka row (dono ek hi shape dete hain):
```jsonc
{
  "_id": "66f...",                       // VendorProfile ka id
  "shopName": "Nagraj Mart",
  "legalName": null, "gstNumber": null, "fssaiNumber": null,
  "logo": null, "supportMobile": null,
  "status": "APPROVED",
  "commissionPercent": 0,
  "defaultLocationId": "6a1e790cc30c2b2ad899249e",
  "delivery": {},                        // khali = deliveryCharge ₹0
  "vendor": {                            // User doc
    "_id": "66a...", "name": "nagraj mart",
    "email": "nagraj@gmail.com", "mobile": "8210574144",
    "role": "vendor", "isActive": true, "isDeleted": false
  },
  "branches": [
    { "_id": "...", "zipcode": "577001", "city": "davangere",
      "isDefault": true, "coordinates": [14.464, 75.922] }
  ],
  "zipcodes": ["577001", "577002", "577003", "577004", "577005", "577006"],
  "branchCount": 6,
  "serviceAreaCount": 6,
  "orderCount": 76,
  "pendingOrderCount": 0,
  "deliveredRevenue": 127216,            // sirf DELIVERED orders ka sum
  "createdAt": "...", "updatedAt": "..."
}
```
> `getAll` pe khali result **`200` + `data: []`** aata hai, `404` nahi.

**Update** — 🔒 **poora endpoint admin-only** (vendor sirf delivery badal sakta hai, §5.6):
```jsonc
PUT /vendors/update/:id                  // isAdmin
{
  "shopName": "...", "name": "...", "mobile": "...",
  "legalName": "...", "gstNumber": "...", "fssaiNumber": "...",
  "supportMobile": "...", "logo": "...",
  "commissionPercent": 5,
  "status": "SUSPENDED",
  "payout": { "accountHolder": "...", "accountNumber": "...", "ifsc": "...", "upiId": "..." },
  "delivery": { ... }                    // admin support ke liye ye bhi kar sakta hai
}
```
Response = updated vendor (upar wala shape). Kuch bhi valid na bheja → `422`.
Vendor token se koi bhi non-delivery field bhejne pe → `403 "Only an admin can change <field>"`.

**Status:**
```jsonc
PUT /vendors/status/:id
{ "status": "SUSPENDED" }        // APPROVED | SUSPENDED

200 { "data": { "vendorId": "...", "status": "SUSPENDED", "shopName": "Nagraj Mart" } }
```
> `SUSPENDED` karte hi us vendor ka catalog customers ko dikhna **band** ho jaata hai (unhe `PINCODE_NOT_SERVICEABLE` milega). Cache ki wajah se **5 min tak** purana behaviour dikh sakta hai — status change pe backend cache khud clear kar deta hai, par multi-instance setup me thoda lag ho sakta hai.

---

### 5.3 Branches
```
POST /vendors/:id/branches                       // isAdmin
GET  /vendors/:id/branches                       // isAdmin | isVendor(self) — read-only
PUT  /vendors/:id/branches/:locationId/default   // isAdmin
```
`POST` ka body wahi jo §5.1 ke `branch` me hai (+ optional `isDefault: true`).

`GET` → array, `isDefault` wala sabse upar:
```jsonc
200 { "data": [
  { "_id": "...", "type": "VENDOR_BRANCH", "name": "main shop",
    "address": "vittal mandir road", "area": "maharaja pet",
    "city": "davangere", "district": "davangere", "state": "karnataka",
    "country": "india", "zipcode": "577001",
    "formattedAddress": "...", "coordinates": [14.464, 75.922],
    "isDefault": true, "isActive": true, "isDeleted": false }
] }
```

**Set default:**
```jsonc
PUT /vendors/:id/branches/:locationId/default
200 { "data": { "locationId": "...", "zipcode": "577001", "isDefault": true } }

422 { "message": "This branch has invalid coordinates [0,0] — fix them first" }
```

> ⚠️ **Vendor ke multiple branch ho sakte hain, par delivery distance HAMESHA `isDefault` wale se nikalti hai.** Default badalne se us vendor ke **saare naye orders** ka distance aur delivery charge badal jaayega. Panel me confirm dialog rakhein.
>
> Pehla branch apne-aap default banta hai. Backend single-default invariant enforce karta hai — naya default set karte hi baaki apne-aap `false` ho jaate hain.

---

### 5.4 Service areas (pincodes) — **exclusive territory**

> 🔑 **Ek pincode sirf EK vendor ke paas ho sakta hai.**

```jsonc
POST /vendors/:id/service-areas                  // isAdmin
{
  "locationId": "6a1e790cc30c2b2ad899249e",      // kaunsi branch serve karegi
  "areas": [
    { "zipcode": "577001", "city": "davangere", "district": "davangere", "state": "karnataka" },
    { "zipcode": "577002" },
    { "zipcode": "577003", "etaMinutes": 180, "minOrderAmount": 500 }
  ]
}
```
```jsonc
// ✅ sab theek
201 {
  "success": true,
  "message": "Service areas saved successfully",
  "data": {
    "created": 2,
    "updated": 1,          // jo pincodes pehle se isi vendor ke the
    "areas": [
      { "_id": "...", "vendorId": "...", "locationId": "...",
        "zipcode": "577001", "city": "davangere", "district": "davangere",
        "state": "karnataka", "country": "india",
        "etaMinutes": null, "minOrderAmount": null,
        "freeDeliveryAbove": null, "deliveryChargeOverride": null,
        "isActive": true, "isDeleted": false }
    ]
  }
}

// 🔴 koi pincode doosre vendor ke paas hai → POORA BATCH REJECT, kuch likha nahi jaata
409 {
  "success": false,
  "message": "2 pincodes are already assigned to other vendors",
  "code": "PINCODE_ALREADY_ASSIGNED",
  "error": {
    "conflicts": [
      { "zipcode": "577002", "vendorId": "66a...", "shopName": "sharma traders" },
      { "zipcode": "577003", "vendorId": "66b...", "shopName": "nvs davangere" }
    ]
  }
}
```

**Panel me kya karna hai:** conflict list dikhao aur do options do — (a) wo pincodes hata ke dobara submit, (b) reassign API.

```
GET    /vendors/:id/service-areas?page=1&limit=100&zipcode=&isActive=
DELETE /vendors/:id/service-areas/:areaId        // isAdmin — pincode free ho jaayega
GET    /service-areas/lookup?zipcode=577001      // isAdmin — add karne se PEHLE check karo
PUT    /service-areas/reassign                   // isAdmin
```

**Lookup** — pincode kis vendor ke paas hai:
```jsonc
// assigned
200 { "data": {
  "zipcode": "577001", "assigned": true, "isActive": true, "areaId": "...",
  "vendor": { "id": "...", "shopName": "Nagraj Mart", "status": "APPROVED" }
} }

// free
200 { "data": { "zipcode": "560001", "assigned": false, "vendor": null } }
```

**Delete** — soft delete, pincode turant free:
```jsonc
200 { "data": { "zipcode": "577002" } }
```

**Reassign** — ek vendor se doosre ko (purani row soft-delete + nayi create, ek transaction me):
```jsonc
PUT /service-areas/reassign
{ "zipcode": "577002", "toVendorId": "66b...", "toLocationId": "66c..." }

200 { "data": { "zipcode": "577002", "from": "66a...", "to": "66b...",
                "shopName": "Sharma Traders" } }

409 { "code": "PINCODE_ALREADY_ASSIGNED",
      "message": "Pincode 577002 is already assigned to Sharma Traders" }
```
> Chup-chaap overwrite **kabhi nahi** hota — transfer ke liye yahi explicit API use karo.

---

### 5.6 🆕 Delivery settings — **Vendor panel ka apna endpoint**

> 🏪 Ye **ek hi cheez** hai jo vendor khud badal sakta hai. Shop name, mobile, address, branches, service areas, GST, payout, commission, status — **sab admin ke haath me**.

```jsonc
PUT /vendors/me/delivery          // isVendor — apni hi profile
{
  "isEnabled": false,             // 🔑 MASTER SWITCH
  "baseCharge": 30,
  "perKmRate": 5,
  "perKgRate": 1.5,
  "minDeliveryCharge": 40,        // floor (0 = koi floor nahi)
  "baseMaxCharge": 150,           // cap (null = koi cap nahi)
  "maxPerKgIncrement": 1.2,
  "maxPerKmIncrement": 4,
  "freeDeliveryAbove": 2000,      // null = kabhi free nahi
  "minOrderAmount": 0,
  "maxRadiusKm": 15               // null = platform ka 50km lagega
}

200 { "message": "Delivery settings updated",
      "data": { "vendorId": "...", "delivery": { ...saara config } } }
```

**Formula:**
```
charge = baseCharge + distance×perKmRate + weight×perKgRate
         ↓ floor: minDeliveryCharge
         ↓ cap:   baseMaxCharge + weight×maxPerKgIncrement + distance×maxPerKmIncrement
         ↓ platform hard cap (Setting.maxAllowedDeliveryCharge, default ₹200)
         ↓ subTotal >= freeDeliveryAbove  →  ₹0
```

**🔑 Naye vendor ke defaults — values bhari hui, switch OFF:**
```jsonc
{
  "isEnabled": false,        // 🔑 charge ₹0
  "baseCharge": 30, "perKmRate": 5, "perKgRate": 1.5,
  "minDeliveryCharge": 40, "baseMaxCharge": 150,
  "maxPerKgIncrement": 1.2, "maxPerKmIncrement": 4,
  "freeDeliveryAbove": null, "minOrderAmount": 0, "maxRadiusKm": null
}
```
Vendor ko **khali form nahi** milega — ready-made rates milenge (wahi jo purane global Setting me the). Bas toggle off hai.

26kg / 3km pe ye rates ₹84 banate hain — **par `isEnabled: false` hai, to customer ko ₹0 hi lagega.** Vendor toggle on karte hi ₹84 lagna shuru.

**3 baatein jo panel me clear honi chahiye:**

| | |
|---|---|
| **`isEnabled` master switch hai** | `false` → charge **hamesha ₹0**, chahe baaki values kuch bhi hon. Panel me isko ek bada toggle banao: *"Delivery charge lena shuru karein"*, aur saath me preview dikhao: *"On karne pe 26kg/3km ka order ₹84 dega"* |
| **Cap fields me `null` bhejo, `0` nahi** | `baseMaxCharge: 0` bhej diya to **cap 0 ho jayega aur charge hamesha ₹0 rahega** — bade confusion ki wajah. Khali field = `null` |
| **`freeDeliveryAbove: 0` = sab kuch free** | Isliye default `null` hai. Khali field pe `null` bhejo |

**Platform limits (vendor cross nahi kar sakta):**
- `maxAllowedDeliveryCharge` — default ₹200. Vendor ₹99999 set kare to bhi customer se ₹200 hi lega.
- `maxRadiusKm` — vendor apna **chhota** radius set kar sakta hai, platform ke 50km se **upar nahi**.

**Migration ke baad Nagraj Mart ko kya milega:** bilkul yahi — purane global Setting ki values profile me bhari hui, `isEnabled: false`. Matlab **charge ₹0, aaj jaisa hi**. Har naye vendor ko bhi yahi milega.

### 5.5 Serviceability check — **App team**
```
GET /service-areas/check?zipcode=577004          // verifyJwtToken (login mandatory)
```
```jsonc
// ✅ serve hota hai
200 {
  "success": true,
  "message": "Delivery available",
  "data": {
    "serviceable": true,
    "zipcode": "577004",
    "vendor": {
      "id": "66a...", "shopName": "Nagraj Mart", "logo": null,
      "etaMinutes": null, "minOrderAmount": 0, "freeDeliveryAbove": null
    }
  }
}

// ❌ nahi karta
404 {
  "success": false,
  "message": "We don't deliver to 110001 yet",
  "code": "PINCODE_NOT_SERVICEABLE",
  "error": { "zipcode": "110001" }
}
```

**App flow:** address save karne se **pehle** ye call karo. `404` aaye to address save mat hone do, "coming soon" dikha do.

> 💡 Ye response server pe **5 min cache** hota hai, to baar-baar call karna sasta hai. Lekin app me bhi ek baar cache kar lo — har screen pe call karne ki zaroorat nahi.

---

## 6. 🟢 Phase 2 — Location-aware listing · **App team ka main change** — CODE READY

### 6.1 Kya badal raha hai

Teeno listing APIs ab customer ke **pincode ke hisaab se** filter hongi. Endpoint aur response shape **same** hai — bas do naye optional params aur do naye errors.

| Endpoint | Change |
|---|---|
| `GET /categories/getAll` | + `zipcode`/`locationId` params, + pincode filter |
| `GET /subCategories/getAll` | same |
| `GET /products/getAll` | same |
| `GET /products/get/:id` | + serviceability check |

### 6.2 Pincode kahan se aata hai (priority order)

```
1. ?locationId=<id>   — customer ne apne saved address me se koi select kiya
2. ?zipcode=577004    — "deliver to" picker (customer ne khud pincode daala)
3. kuch nahi bheja    — customer ka DEFAULT address (isDefault: true)
```
**Explicit param hamesha default se jeetta hai.** Matlab jis customer ka address save hai wo bhi `?zipcode=` se doosra area check kar sakta hai (bina apna default badle).

`locationId` ka address customer ka apna hona chahiye, warna `404 "Delivery address not found"`.

> 🔑 **95% cases me kuch bhejne ki zaroorat nahi** — backend customer ke default address se khud resolve kar lega. Params sirf tab bhejo jab customer ne explicitly koi doosra address/pincode choose kiya ho.

### 6.3 Request
```
GET /categories/getAll?page=1&limit=10
GET /categories/getAll?locationId=6a9e50e1a359116c474ca8cb
GET /categories/getAll?zipcode=577004

GET /subCategories/getAll?categoryId=<id>&locationId=<id>
GET /products/getAll?subCategoryId=<id>&minPrice=1000&maxPrice=2500&locationId=<id>
```

### 6.4 Naye responses

```jsonc
// ✅ serviceable, items hain
200 { "success": true, "data": { "total": 15, "totalPages": 2, "page": 1, "limit": 10, "data": [...] } }

// ✅ serviceable, par list khali — 🆕 ye ab 200 hai, 404 NAHI
200 { "success": true, "data": { "total": 0, "totalPages": 0, "page": 1, "limit": 10, "data": [] } }

// ❌ customer ka koi address hi nahi
400 { "success": false, "message": "Please select a delivery location", "code": "PINCODE_REQUIRED" }

// ❌ pincode serve nahi hota
404 { "success": false, "message": "We don't deliver to 110001 yet",
      "code": "PINCODE_NOT_SERVICEABLE", "error": { "zipcode": "110001" } }
```

> 🔴 **Ye ek behaviour change hai:** pehle **khali list pe bhi `404`** aata tha (`"No any category found"`). Ab khali list `200` + `data: []` hai. App me "no results" ka empty state chahiye. `404` ab **sirf** serviceability ke liye hai.

### 6.5 Role ke hisaab se kya dikhta hai — **sab teams**

Wahi endpoints, alag scope. Frontend ko kuch alag nahi karna, backend token se decide karta hai:

| Role | Kya dikhta hai |
|---|---|
| `user` | Sirf uske pincode ke vendor ka catalog, sirf `isActive: true` |
| `vendor` | Sirf apna catalog (inactive bhi, taaki manage kar sake) |
| `admin` | Sab. `?vendorId=<id>` se ek vendor pe filter kar sakta hai |

> ⚠️ **App team:** `?userId=` param customer ke liye ab **ignore** hota hai. Uspe depend mat karo.

### 6.6 Product detail
```
GET /products/get/:id
```
```jsonc
404 { "success": false, "message": "This product is not available in your area",
      "code": "PRODUCT_NOT_AVAILABLE_HERE" }
```
Deep-link / share-link handle karte waqt ye case aayega — product exist karta hai par customer ke area me nahi.

### 6.7 ⚠️ App team ke liye sabse zaroori baat

Prod me **1452 customers me se sirf 96 ke paas address hai**. Matlab **~1355 customers** ko pehli baar `400 PINCODE_REQUIRED` milega.

**App me chahiye:**
1. Login ke baad `GET /users/get` → `locationId` null hai to **address onboarding screen**
2. Address dalne se pehle `GET /service-areas/check?zipcode=` se verify
3. Har listing call pe `PINCODE_REQUIRED` handle → wahi onboarding screen
4. `PINCODE_NOT_SERVICEABLE` handle → "coming soon" screen

**Aur:** 13 customers ke address service area ke bahar hain (577008, 577601, 834008, 94043 etc.) — unhe `PINCODE_NOT_SERVICEABLE` milega. Screen me "doosra address add karein" ka option zaroor rakhein.

---

## 7. 🟢 Phase 3 — Cart · **App team** — CODE READY

> ⚠️ **Saare cart routes ab `isUser` ke peeche hain** — vendor/admin token se `403`. Pehle koi bhi role cart bana sakta tha.

### 7.1 Add to cart — vendor lock
```jsonc
POST /carts/add-or-update
{ "productId": "6a1e6ac4c30c2b2ad899247d", "quantity": 1 }
```
> `quantity` **add hoti hai** (increment), set nahi. Ek item ka 1 bhejo to +1 hota hai. Stock se zyada hone pe apne aap stock tak clamp ho jaata hai.

```jsonc
// ✅
201 { "success": true, "message": "Cart updated", "data": {
  "_id": "...", "userId": "...", "vendorId": "66a...",
  "items": [{ "productId": "...", "quantity": 1,
              "productWeight": 26, "itemWeight": 26, "priceSnapshot": 1600 }],
  "subTotal": 1600, "totalQuantity": 1, "totalWeight": 26,
  "deliveryZipcode": null,
  "verifiedAt": null,          // ⚠️ cart badla → dobara verify karna hoga
  "isPurchased": false, "isDeleted": false
} }

// 🔴 cart kisi aur vendor ka hai
409 {
  "success": false,
  "message": "Your cart has items from Nagraj Mart",
  "code": "CART_VENDOR_CONFLICT",
  "error": {
    "currentVendor": { "id": "66a...", "shopName": "Nagraj Mart" },
    "newVendor":     { "id": "66b...", "shopName": "Sharma Traders" }
  }
}

// 🔴 product customer ke area me nahi
404 { "code": "PRODUCT_NOT_AVAILABLE_HERE",
      "message": "This product is not available in your area" }
```

> 🔑 **`verifiedAt` pe dhyan do.** Cart me koi bhi change (add / remove / decrease) `verifiedAt` ko `null` kar deta hai. Checkout se pehle `verify-delivery` dobara call karna zaroori hai, warna `POST /orders/create` `400 CART_NOT_VERIFIED` dega.
**Resolve karne ke liye:**
```
POST /carts/add-or-update?replaceCart=true
```
→ purana cart clear, naya item add.

**Ye kab hoga:** customer ne delivery address badal diya (doosre vendor ka area), ya purana cart pada tha aur territory badal gayi. Normal browsing me nahi hoga.

> 💡 **Behtar UX:** address switch karte hi `GET /carts/get` ka `vendorId` aur `GET /service-areas/check` ka `vendor.id` compare kar lo. Mismatch ho to **wahin dialog dikha do** — 10 item daalne ke baad checkout pe mat rokо.

### 7.2 Get cart
```
GET /carts/get
```
> 🔴 `?userId=` support **hata diya** — pehle koi bhi logged-in user kisi ka bhi cart padh sakta tha.

Response me ab **product details bhi aate hain**, to har item ke liye alag call karne ki zaroorat nahi:
```jsonc
200 { "success": true, "data": {
  "_id": "...", "userId": "...", "vendorId": "66a...",
  "deliveryZipcode": "577004",
  "verifiedAt": "2026-09-13T10:22:00.000Z",
  "items": [{
    "productId": "...", "quantity": 2,
    "productWeight": 26, "itemWeight": 52,
    "priceSnapshot": 1600, "resolvedPincode": "577004",
    "product": {                       // 🆕
      "_id": "...", "name": "bell", "brand": "bullet brand",
      "image": "https://...", "weightInKg": 26, "stockQuantity": 500
    }
  }],
  "subTotal": 3200, "totalQuantity": 2, "totalWeight": 52,
  "vendor": { "id": "66a...", "shopName": "Nagraj Mart", "logo": null }   // 🆕
} }

404 { "success": false, "message": "Your cart is empty" }
404 { "success": false, "message": "All items in your cart are no longer available or out of stock" }
```
> Agar beech me kisi product ka price badal gaya ho, `getCart` naya price laga deta hai **aur `verifiedAt` null kar deta hai** — customer ko dobara verify karna padega. (Pehle price chupchaap palat jaata tha.)

### 7.3 Remove / decrease
```jsonc
PUT /carts/remove/:productId
{ "action": "remove" }     // ya "decrease"
```
> ⚠️ **Existing quirk (badla nahi):** cart khali ho jaaye to response `HTTP 200` hai par `success: false` aur message `"Your cart is now empty"`. Isko error mat samjho — cart clear ho gaya hai, bas.

### 7.4 Verify delivery — checkout se pehle **zaroori**
```jsonc
POST /carts/verify-delivery
{ "locationId": "6a9e50e1a359116c474ca8cb" }   // ya { "zipcode": "577004" }
```
> **`locationId` bhejo** — server usi se zipcode nikalta hai. `zipcode` tab kaam aata hai jab customer ne address save hi nahi kiya. Dono me se **ek zaroori** hai (`422` warna).

```jsonc
// ✅
200 { "message": "Cart verified successfully",
      "data": { "status": "OK", "zipcode": "577004",
                "subTotal": 3200, "etaMinutes": null } }

// 💰 price badal gaya — customer ko dikhao aur confirm karao
//    (cart me naya price save ho chuka hai)
200 { "message": "Prices updated based on pincode",
      "data": { "status": "PRICE_CHANGED", "zipcode": "577004", "subTotal": 3400,
                "priceChanged": [{ "productId": "...", "name": "bell",
                                   "oldPrice": 1600, "newPrice": 1700 }],
                "etaMinutes": null } }

// ❌ kuch items nahi mil sakte — HTTP 400 par data me detail
400 { "success": false, "message": "Some items are not deliverable to this pincode",
      "error": { "status": "FAILED", "zipcode": "577004",
                 "unavailableItems": [
                   { "productId": "...", "name": "bell",
                     "reason": "Only 3 available", "available": 3 }] } }

// ❌ vendor is pincode pe deliver nahi karta
400 { "code": "VENDOR_NOT_SERVICEABLE",
      "message": "Nagraj Mart does not deliver to 577008",
      "error": { "zipcode": "577008", "vendorId": "...", "shopName": "Nagraj Mart" } }

// ❌ minimum order se kam
400 { "code": "MIN_ORDER_NOT_MET", "message": "Minimum order amount is ₹500",
      "error": { "minOrderAmount": 500, "subTotal": 320 } }
```
> `FAILED` par cart **save nahi hota** — customer pehle wo items hataye/adjust kare, phir dobara verify kare.
> Success par `cart.verifiedAt` set ho jaata hai; usi ke baad `POST /orders/create` chalega.

---

## 8. 🟢 Phase 4 — Checkout · **App team** — CODE READY

### 8.1 🆕 Order preview — **naya endpoint, zaroor use karein**
```jsonc
POST /orders/preview          // isUser
{ "locationId": "6a9e50e1a359116c474ca8cb" }
```
```jsonc
200 { "success": true, "message": "Order preview", "data": {
  "subTotal": 3200,
  "deliveryCharge": 0,
  "payableAmount": 3200,
  "distanceKm": 2.17,
  "totalWeight": 52,
  "totalQuantity": 2,
  "freeDeliveryAbove": null,
  "freeDeliveryApplied": false,
  "minOrderAmount": 0,
  "etaMinutes": null,
  "deliveryPincode": "577004",
  "vendor": { "id": "66a...", "shopName": "Nagraj Mart", "logo": null },
  "paymentMethods": ["COD"]
} }
```
> 🔑 Checkout screen pe **yahi numbers dikhao**. `POST /orders/create` bilkul yahi function (`computeOrderPricing`) call karta hai, isliye total kabhi mismatch nahi hoga.
> `paymentMethods` array se hi payment options render karo — kal online enable hua to app me code change nahi karna padega.

### 8.2 Order create
```jsonc
POST /orders/create           // isUser
{ "locationId": "6a9e50e1a359116c474ca8cb", "paymentMethod": "COD" }
```
```jsonc
201 { "success": true, "message": "Order Placed", "data": {
  "type": "COD",
  "orderId": "6a9e5116a359116c474ca8cc",
  "orderNumber": "NVS-2609-000077",
  "subTotal": 3200,
  "deliveryCharge": 0,
  "payableAmount": 3200,
  "status": "PENDING",
  "message": "Order placed successfully with Cash on Delivery"
} }
```
> Naya order seedha **`PENDING`** banta hai (`INITIATED` nahi) — COD me payment ka wait nahi hai, order turant vendor ke paas chala jaata hai.

**Errors:**
| HTTP | `code` | Kab | App kya kare |
|---|---|---|---|
| 400 | `CART_NOT_VERIFIED` | `verify-delivery` nahi hua, ya doosre address ke liye hua tha | `verify-delivery` dobara call karo |
| 400 | `VENDOR_NOT_SERVICEABLE` | Address ka pincode vendor serve nahi karta | Address badalne ko kaho |
| 400 | `OUT_OF_RADIUS` | Distance limit (50km) se zyada | Address badalne ko kaho |
| 400 | `MIN_ORDER_NOT_MET` | Minimum order se kam | Kitna aur chahiye dikhao |
| 409 | `STOCK_UNAVAILABLE` | Beech me stock khatam | Cart refresh karao, `error.unavailableItems` dikhao |
| 503 | `VENDOR_PICKUP_MISSING` | Vendor ka default branch set nahi | "Shop abhi order nahi le paa rahi" |
| 422 | — | `paymentMethod: "ONLINE"` | sirf COD bhejo |

### 8.3 Delivery charge — abhi ₹0 rahega

Vendor ki `delivery` config **khali** hai, isliye `deliveryCharge: 0` aur `payableAmount == subTotal` — **bilkul aaj jaisa**. Jab vendor admin panel se config set karega tab charge lagna shuru hoga.

**App me:** `deliveryCharge` ko hardcode `0` mat karo — `preview` se jo aaye wahi dikhao. Charge on hone par app me koi change nahi karna padega.

### 8.4 Order list / detail
```
GET /orders/getAll?page=1&limit=10&status=DELIVERED
GET /orders/get/:id
```
```jsonc
// order object — customer, vendor aur admin sabko yahi shape milta hai
{
  "_id": "...", "orderNumber": "NVS-2609-000077",
  "userId": "...", "vendorId": "66a...", "vendorLocationId": "...",
  "cartId": "...", "locationId": "...",
  "deliveryPincode": "577004",
  "status": "PENDING", "paymentMethod": "COD", "paymentStatus": "NOT_REQUIRED",
  "subTotal": 3200, "deliveryCharge": 0, "payableAmount": 3200, "distanceKm": 2.17,
  "items": [{
    "productId": "...", "quantity": 2, "price": 1600,
    "productSnapshot": {            // 🆕 order ke waqt ka snapshot
      "name": "bell", "brand": "bullet brand", "SKU": "GROCERY-...",
      "image": "https://...", "weightInKg": 26
    },
    "product": { "name": "bell", "brand": "...", "image": "...", "isDeleted": false }
  }],
  "user": { "_id": "...", "name": "...", "email": "...", "mobile": "..." },
  "vendor": { "_id": "66a...", "shopName": "Nagraj Mart",             // 🆕
              "logo": null, "supportMobile": null },
  "deliveryLocation": { "formattedAddress": "...", "zipcode": "577004",
                        "coordinates": [14.46, 75.92] },
  "pickupLocation": { "_id": "...", "formattedAddress": "...",         // 🆕
                      "zipcode": "577001", "coordinates": [14.464, 75.922] },
  "statusHistory": [                                                   // 🆕
    { "status": "PENDING", "changedBy": "...", "changedByRole": "user",
      "note": null, "at": "2026-09-13T10:30:00.000Z" }
  ],
  "cancelReason": null, "deliveredAt": null, "expectedDeliveryAt": null,
  "assignedTo": null,
  "createdAt": "...", "updatedAt": "..."
}
```
> `productSnapshot` order ke waqt ka data hai — product delete/rename ho jaye to bhi purana order sahi dikhta rahega. **Order history me `productSnapshot` use karo, `product` nahi.**

**Naye filters** (`getAll`): `vendorId`, `orderNumber` (admin ke liye), aur pehle wale sab.

### 8.5 Customer cancel
```jsonc
PUT /orders/:id/cancel        // isUser
{ "reason": "Galti se order ho gaya" }   // body optional
```
Sirf `PENDING` ya `ACCEPTED` me allowed. Uske baad:
```jsonc
422 { "success": false, "code": "INVALID_STATUS_TRANSITION",
      "message": "Cannot move order from PACKED to CANCELLED",
      "error": { "from": "PACKED", "allowed": [] } }
```
Cancel hote hi **stock apne aap wapas** ho jaata hai. Response me poora updated order aata hai.

---

## 9. 🟢 Phase 5 — Vendor order management · **Vendor panel** — CODE READY

### 9.1 Order list
```
GET /orders/getAll?status=PENDING&page=1&limit=20      // vendor token
```
Token se hi `vendorId` scope lag jaata hai — kuch extra bhejne ki zaroorat nahi.

### 9.2 Dashboard summary
```
GET /orders/vendor/summary        // isVendor
```
```jsonc
200 { "data": {
  "pending": 3, "accepted": 1, "packed": 0, "outForDelivery": 2,
  "deliveredToday": 5, "cancelledToday": 0,
  "revenueToday": 12400, "revenueThisMonth": 184300,
  "totalOrders": 76, "lifetimeRevenue": 127216
} }
```

### 9.3 Status change
```jsonc
PUT /orders/:id/status            // isVendor
{ "status": "ACCEPTED", "note": "optional" }
{ "status": "REJECTED", "reason": "Stock khatam" }   // reason MANDATORY
```
**Allowed transitions (vendor):**
```
PENDING          → ACCEPTED | REJECTED
ACCEPTED         → PACKED | REJECTED
PACKED           → OUT_FOR_DELIVERY
OUT_FOR_DELIVERY → DELIVERED
DELIVERED / CANCELLED / REJECTED → (terminal, kahin nahi ja sakte)
```
```jsonc
// ✅ response = poora updated order (statusHistory ke saath)
200 { "message": "Order status updated", "data": { ...order } }

// ❌ galat transition — `error.allowed` me batata hai kya allowed tha
422 { "code": "INVALID_STATUS_TRANSITION",
      "message": "Cannot move order from DELIVERED to PACKED",
      "error": { "from": "DELIVERED", "allowed": [] } }

// ❌ wahi status dobara
422 { "code": "INVALID_STATUS_TRANSITION", "message": "Order is already ACCEPTED",
      "error": { "from": "ACCEPTED", "allowed": ["PACKED", "REJECTED"] } }

// ❌ reject bina reason ke
422 { "message": "A reason is required when rejecting an order" }

// ❌ doosre vendor ka order
404 { "code": "FORBIDDEN", "message": "Order not found" }
```
> 💡 **Panel me:** current status ke hisaab se sirf allowed buttons dikhao. Galti se galat button dab jaye to `error.allowed` se UI correct kar sakte ho.
>
> **REJECTED / CANCELLED pe stock automatically wapas ho jaata hai** — panel ko kuch nahi karna.

### 9.4 🔴 Admin ab order pe action NAHI le sakta

```jsonc
PUT /orders/:id/status     // admin token
403 { "code": "FORBIDDEN",
      "message": "Forbidden: only the vendor can update this order" }
```
Admin sirf **dekh** sakta hai. Purana `PUT /orders/update/:id` route **hat chuka hai** (§2.8).

> ⚠️ **Admin panel team:** order status-change UI ko **read-only** kar dijiye.

### 9.5 🆕 Admin summary (read-only)
```
GET /orders/admin/summary         // isAdmin
```
```jsonc
200 { "data": {
  "totals": { "totalOrders": 76, "pending": 0, "delivered": 49,
              "cancelled": 27, "ordersToday": 0, "revenue": 127216 },
  "vendors": [{
    "vendorId": "66a...", "shopName": "Nagraj Mart", "status": "APPROVED",
    "totalOrders": 76, "pending": 0, "delivered": 49, "cancelled": 27,
    "ordersToday": 0, "revenue": 127216
  }]
} }
```

### 9.6 Notifications (FCM)

Data payload hamesha: `{ "type": "order", "orderId": "...", "orderNumber": "NVS-2609-000077" }`

| Event | Customer | Vendor | Admin |
|---|---|---|---|
| Order placed | ✅ "Order placed" | ✅ **"New order received"** | ✅ "New order" |
| Accepted | ✅ "Order accepted" | — | — |
| Packed | ✅ "Order packed" | — | — |
| Out for delivery | ✅ "Out for delivery" | — | — |
| Delivered | ✅ "Order delivered" | ✅ | — |
| Rejected (vendor) | ✅ + reason | — | ✅ |
| Cancelled (customer) | — | ✅ "Order cancelled by customer" | — |

> Vendor panel/app ko FCM token login pe bhejna hoga (`POST /auth/login` me `fcmToken`), warna "New order received" notification nahi aayegi — aur COD-only flow me wahi vendor ka poora workflow trigger karta hai.
>
> 🔧 Notification ab **kabhi API fail nahi karti**. Pehle FCM token na hone par helper throw kar deta tha aur order ban jaane ke baad bhi API error de deti thi. Ab token na ho to chup-chaap skip hota hai.

---

## 10. Per-team summary

### 📱 App developer (customer app)

**Abhi karna hai (Phase 0 live):**
- [ ] Auth calls se `role` hatao
- [ ] `GET /users/getAll` ka use hatao
- [ ] `GET /users/get` se `?userId=` hatao
- [ ] `GET /orders/getAll` se `?userId=` hatao (ab auto-scoped)
- [ ] `POST /orders/create` me `paymentMethod` hamesha `"COD"`
- [ ] `POST /orders/verify-payment` / Razorpay flow hatao (agar hai)
- [ ] `POST /locations/create` me `coordinates` `[lat, lng]` confirm karo

**Phase 2 ke saath (ye sabse bada kaam hai):**
- [ ] **Address onboarding screen** — `locationId` null wale ~1355 users ke liye
- [ ] Address list me **edit** + **"set as default"** buttons (`PUT /locations/update/:id`, `PUT /locations/set-default/:id`) — §2.9
- [ ] `PINCODE_REQUIRED` → onboarding screen
- [ ] `PINCODE_NOT_SERVICEABLE` → "coming soon" screen + "doosra address add karein"
- [ ] Khali list ab `200` + `data: []` — **empty state** banao (pehle 404 aata tha)
- [ ] `GET /service-areas/check` — address save karne se pehle
- [ ] `PRODUCT_NOT_AVAILABLE_HERE` — deep-link ke liye

**Phase 3-5:**
- [ ] `CART_VENDOR_CONFLICT` dialog + `?replaceCart=true`
- [ ] Address switch pe cart vendor mismatch proactive check
- [ ] 🔑 **`cart.verifiedAt` track karo** — cart me koi bhi change ise `null` kar deta hai; checkout se pehle `verify-delivery` dobara
- [ ] `GET /carts/get` se `?userId=` hatao (ab `404`/apna hi cart)
- [ ] `POST /orders/preview` checkout screen pe — totals wahi se dikhao
- [ ] `deliveryCharge` dynamic rakho (abhi ₹0, hardcode mat karo)
- [ ] `paymentMethods` array se payment options render karo
- [ ] `PUT /orders/:id/cancel` (sirf PENDING/ACCEPTED me button dikhao)
- [ ] `orderNumber` order history me dikhao
- [ ] Order history me `productSnapshot` use karo (`product` nahi — wo delete ho sakta hai)
- [ ] `statusHistory` se order tracking timeline banao

### 🏪 Vendor panel developer

Vendor panel **naya** hai. Phase 1 se shuru kar sakte ho.

- [ ] Login: `POST /auth/login` with `role: "vendor"` + `fcmToken`
- [ ] Catalog CRUD: categories / subCategories / products — same endpoints, token se auto-scope
- [ ] `isActive` ab **set** hota hai, toggle nahi
- [ ] Branches + service areas — **read-only** (`GET` only; add/edit admin karega)
- [ ] Orders: `GET /orders/getAll` (auto-scoped), `GET /orders/vendor/summary`
- [ ] `PUT /orders/:id/status` — state machine ke hisaab se buttons
- [ ] Reject pe `note` mandatory
- [ ] FCM setup — "New order" notification hi main trigger hai
- [ ] 🏪 **Delivery settings screen** (`PUT /vendors/me/delivery`) — §5.6
  - [ ] `isEnabled` ko bada toggle banao ("Delivery charge lena shuru karein")
  - [ ] Khali cap fields pe **`null` bhejo, `0` nahi** (0 = charge hamesha ₹0)
  - [ ] `freeDeliveryAbove` khali ho to `null`
  - [ ] Platform limits dikhao (₹200 max charge, 50km max radius)
- [ ] ⚠️ Baaki sab (shop name, mobile, address, branches, service areas) **read-only** — change ke liye admin ko bolna hai

### 🖥️ Admin panel developer

- [ ] 🔴 `isActive` toggle→set wala workaround hatao (agar hai) — §2.2
- [ ] 🔴 **Order status-change UI hatao / read-only karo** — `PUT /orders/update/:id` ab `404` hai (§2.8)
- [ ] `GET /users/getAll` abhi bhi chalta hai (ab sirf admin ke liye) — koi change nahi
- [ ] Naya section: **Vendors** — create, list, detail, update, suspend (§5.1, §5.2)
- [ ] Naya section: **Branches** — add, set default (⚠️ default = pickup point, distance isi se) (§5.3)
- [ ] Naya section: **Service areas** — bulk add, conflict UI (`PINCODE_ALREADY_ASSIGNED`), lookup, reassign (§5.4)
- [ ] Vendor ka **delivery config** form (`PUT /vendors/update/:id` → `delivery`) — khali hai to charge ₹0
- [ ] Orders me naye filters: `vendorId`, `orderNumber`
- [ ] Order me naye fields: `vendorId`, `orderNumber`, `statusHistory`, `deliveryPincode`, `vendor`, `pickupLocation`, `productSnapshot`
- [ ] Naya read-only dashboard: `GET /orders/admin/summary` (§9.5)

---

## 11. Data model — final structure

> Migration ke baad **purana data aur naya data bilkul ek jaisa** hai. Neeche
> jo shape hai wahi har doc ka hai — chahe wo 3 mahine purana order ho ya
> abhi bana ho. Ye rehearsal DB pe field-by-field diff se verify kiya gaya hai.

### Order item — 4 fields, bas
```jsonc
{
  "productId": "…",
  "quantity": 1,
  "price": 1350,                 // order ke waqt ka price, kabhi nahi badalta
  "productSnapshot": { "name", "brand", "SKU", "image", "weightInKg" }
}
```
- ❌ `vendorId` **nahi hai** — order level pe hai (ek order = ek vendor)
- ❌ `locationId` **nahi hai** — hata diya gaya
- 🔑 **Order history me `productSnapshot` use karo**, `product` nahi — product delete/rename ho jaye to bhi purana order sahi dikhega

> Purane 76 orders ka `productSnapshot` migration me **aaj ke** product data se bhara gaya hai (order ke waqt ka naam kahin store hi nahi hua tha). `price` asli historical hi hai.

### Cart — khali vs bhara
```jsonc
// items ke saath — vendorId HAMESHA hota hai
{ "userId", "vendorId", "items": [...], "subTotal", "totalWeight",
  "totalQuantity", "deliveryZipcode", "verifiedAt", "isPurchased", "isDeleted" }

// khali (clear hone ke baad) — vendorId aur deliveryZipcode HAT jaate hain
{ "userId", "items": [], "subTotal": 0, "totalWeight": 0,
  "totalQuantity": 0, "verifiedAt": null, "isPurchased": false, "isDeleted": true }
```
`cart.vendorId` **permanent link nahi, temporary lock hai** — jab tak items hain tab tak.

### Hataye gaye fields (koi code inhe likhta ya padhta nahi tha)
```
Location.isProductAddress   →  `type` ne replace kiya
Location.isVendorAddress    →  wahi
Location.geo                →  koi writer/reader/index nahi tha
User.address                →  address `Location` collection me hai
Order.expectedDeliveryAt    →  koi writer nahi tha
Order.items[].vendorId      →  order level pe hai
Order.items[].locationId    →  ProductLocation ke saath gaya
Cart.items[].vendorId       →  cart level pe hai
Setting.delivery.*          →  9 charge fields vendor profile me gaye
```

### Collections
```
users · locations · categories · subcategories · products · carts · orders
settings · banners · transactions · subscriptions · privacy&policies · term&conditions
🆕 vendorprofiles · vendorserviceareas · counters
❌ productlocations — DROP (price/stock ka single source ab `Product` hai)
```

---

## 12. Changelog

| Date | Phase | Kya badla |
|---|---|---|
| 2026-09-13 | Phase 0 ✅ | Auth role escalation fix · orders/locations/users/carts scoping · `isActive` toggle→set · COD-only · routes removed · `updateOrder` whitelist · indexes |
| 2026-09-13 | Phase 1 ✅ | Vendor onboarding: `/vendors/*` (14 routes) + `/service-areas/*` · `VendorProfile` + `VendorServiceArea` models · exclusive-territory unique index · zipcode→vendor cache · migration script |
| 2026-09-13 | Phase 2 ✅ | `attachServiceContext` middleware · teeno listing APIs pincode-scoped · khali list ab `200` · `PRODUCT_NOT_AVAILABLE_HERE` |
| 2026-09-13 | Phase 3 ✅ | `Cart.vendorId` + `CART_VENDOR_CONFLICT` · `verifiedAt` · `verify-delivery` ab `VendorServiceArea` + `Product` se · cart routes `isUser` · `?userId=` IDOR fix |
| 2026-09-13 | Phase 4 ✅ | `POST /orders/preview` · `computeOrderPricing` shared helper · `orderNumber` (atomic counter) · `productSnapshot` · stock reserve `Product` pe · `PUT /orders/update/:id` removed |
| 2026-09-13 | Phase 5 ✅ | `PUT /orders/:id/status` + state machine · `PUT /orders/:id/cancel` · vendor/admin summary · notification rewrite (recipient-aware, non-throwing) |
| 2026-09-14 | Postman ✅ | 97-request collection (Customer / Vendor / Admin), sequence me · har request ka **asli 200 example StageDB se record** · 4 bug fix (neeche §14.3) |
| — | Migration | Prod data backfill *(sabse last me — abhi pending)* |

---

## 13. Backend verification

Har phase ka apna test suite hai — koi DB connection nahi chahiye:

```bash
cd server
node scripts/verify-all.js        # saare phases ek saath
node scripts/verify-phase2.js     # ek phase alag se
```
```
✅ Phase 0 — security & bug hardening              73 pass    0 fail
✅ Phase 1 — vendor foundation                     97 pass    0 fail
✅ Phase 2 — location-aware catalog                41 pass    0 fail
✅ Phase 3 — vendor-locked cart                    48 pass    0 fail
✅ Phase 4+5 — checkout & vendor orders           109 pass    0 fail
   TOTAL: 368 pass, 0 fail
```

**Orphan vendor repair** — agar kisi ka `User(role: vendor)` hai par
`VendorProfile` nahi (purane code se bana hua), wo vendor poori tarah atka
rehta hai. Ye script unhe dhoondh ke profile bana deti hai:
```bash
node scripts/repairVendorProfiles.js           # DRY RUN
node scripts/repairVendorProfiles.js --apply
```

**End-to-end flow test** — asli HTTP calls, login se delivery tak, apna isolated
data banake cleanup karta hai (prod pe chalne se mana karta hai):
```bash
node scripts/e2e-flow-test.js
```
```
PASS: 145    FAIL: 0
```
14 sections cover karta hai: admin→vendor onboarding, exclusive territory
conflict, vendor catalog + cross-vendor guards, customer signup/address,
pincode-scoped listing, cart + vendor lock, verify→preview→order,
order scoping, vendor status flow, cancel/reject + stock restore, stock
guards, vendor suspend, delivery charge, address delete→default promote.

Migration ka dry run (kuch likhta nahi):
```bash
node scripts/migrateToVendorModel.js           # DRY RUN
node scripts/migrateToVendorModel.js --apply   # actual writes
```

---

## 14. Postman collection

`server/postman/` me ready-to-import collection hai — **97 requests, teen folder,
call sequence me lagi hui**.

```
postman/NVS-Rice-Mart.postman_collection.json    ← import #1
postman/NVS-Rice-Mart.postman_environment.json   ← import #2
postman/README.md                                ← setup + regenerate steps
```

| Folder | Requests | Sequence |
|---|---|---|
| 1 · Customer (mobile app) | 37 | login → profile → address → catalog → cart → verify → preview → order → tracking → cancel → content |
| 2 · Vendor (shop panel) | 28 | login → profile/delivery → category → subcategory → product → order queue → status transitions |
| 3 · Admin (admin panel) | 32 | login → vendor → branch → pincode lookup → service area → orders (read-only) → users → settings → content |

### 14.1 Environment

| Variable | Kya hai |
|---|---|
| `target` | `local` \| `stage` \| `prod` — sirf yahi badlo |
| `baseUrl` | pre-request script har call se pehle `target` ke hisaab se set kar deta hai |
| `localUrl` / `stageUrl` / `prodUrl` | teeno environment ke URL |
| `customerToken` / `vendorToken` / `adminToken` | login request apne aap bhar deti hai |
| `customerId`, `vendorId`, `branchId`, `serviceAreaId`, `categoryId`, `subCategoryId`, `productId`, `locationId`, `orderId`, `orderNumber`, `bannerId`, `termId`, `privacyId`, `otpSessionId` | chain me apne aap save hote rehte hain |

Teeno URL pehle se bhare hue hain — `localUrl` `http://localhost:8000/nvs-rice-mart`,
`stageUrl` `https://nvs-rice-mart.onrender.com/nvs-rice-mart`,
`prodUrl` `https://api.nvsricemart.com/nvs-rice-mart`.

### 14.2 Saved examples

Har request ka **200/201 example save hai** aur wo StageDB pe **asli call maar ke**
record kiya gaya hai — haath se likha hua nahi. `postman/capture.js` read endpoints
asli data pe chalati hai aur write endpoints ke liye temp vendor/customer/catalog/orders
ka alag bubble banati hai, phir **sab delete kar deti hai** (`orderNumber` counter bhi
wapas set ho jata hai).

Sirf 4 OTP endpoints (`loginOrSignin-with-mobile/email`, `verify-otp-mobile/email`)
ke examples documented hain — unhe chalane pe asli SMS/email chala jata hai. Un
requests ki description me ye saaf likha hai.

Regenerate:
```bash
DISABLE_PUSH=true node postman/capture.js   # stage se asli responses
node postman/build.js                       # collection + environment
node postman/verify.js                       # 721 checks
```
`verify.js` khud `routes/` padhta hai — naya route add karke collection me daalna
bhool gaye to wo pakad lega.

### 14.3 Collection banate waqt 4 bug mile aur fix hue

| # | Kahan | Kya tha | Ab kya hai |
|---|---|---|---|
| 1 | `PUT /terms-and-conditions/update/:id`<br>`PUT /privacy-and-policies/update/:id` | `title` bhejte hi **hamesha `500`** (`result.findOne is not a function` — document pe model ka method call ho raha tha) | Model pe `findOne`; duplicate title pe saaf `409` |
| 2 | wahi dono endpoints | `isActive` **toggle** ho raha tha — panel `true` bhejta to entry `false` ho jati | Ab jo bhejoge **wahi set** hota hai (categories/subcategories ki tarah) |
| 3 | `POST /auth/login`, `POST /auth/register` | Response ke `data.user` me **bcrypt password hash** ja raha tha (`User.password` pe `select: false` tha hi nahi) | `password` ab `select: false`; login/register response se hash strip |
| 4 | `GET /users/getAll` | Wahi hash **har user ke liye** — aggregation schema ka `select: false` bypass kar deti hai, isliye ek call me ~1450 bcrypt hash | Pipeline me `{ $unset: ["password", "otp"] }` |

**Panel dev ke liye matlab:** #1 aur #2 ki wajah se Terms/Privacy ka edit screen
pehle kaam hi nahi karta tha — ab karega, par `isActive` ki **nayi value** bhejni
hogi (purana "bas field bhej do" wala code hata do).

#3 aur #4 se **response ka shape badla hai** — `data.user` me ab `password` field
nahi aayega. Kisi bhi client ne agar us field pe koi assumption banaya ho
(TypeScript type, model class, `JSON.parse` ke baad mapping) to hata dena.
