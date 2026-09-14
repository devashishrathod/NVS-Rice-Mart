# Postman collection — NVS Rice Mart

Vendor-based platform ki poori API, teen folder me, **call sequence me lagi hui**.

```
postman/
├── NVS-Rice-Mart.postman_collection.json    ← ye import karo
├── NVS-Rice-Mart.postman_environment.json   ← aur ye bhi
├── examples.json                            ← StageDB se record kiye gaye asli responses
├── spec/                                    ← har endpoint ki body/description/enums
│   ├── shared.js      (tags, common query params, error rows, description builder)
│   ├── customer.js    (37 requests)
│   ├── vendor.js      (28 requests)
│   └── admin.js       (32 requests)
├── capture.js                               ← stage pe chal ke asli 200 responses record karta hai
├── build.js                                 ← spec + examples → collection + environment
└── verify.js                                ← collection sahi hai ya nahi, check karta hai
```

---

## Import kaise karein

1. Postman → **Import** → dono file drag karo:
   - `NVS-Rice-Mart.postman_collection.json`
   - `NVS-Rice-Mart.postman_environment.json`
2. Upar right corner se environment **"NVS Rice Mart"** select karo.
3. Teeno URL pehle se bhare hue hain:
   | var | value |
   |---|---|
   | `localUrl` | `http://localhost:8000/nvs-rice-mart` |
   | `stageUrl` | `https://nvs-rice-mart.onrender.com/nvs-rice-mart` |
   | `prodUrl`  | `https://api.nvsricemart.com/nvs-rice-mart` |

## Local / stage / prod switch

Environment me sirf **`target`** badlo — `local`, `stage` ya `prod`.
Collection ka pre-request script har call se pehle `baseUrl` khud set kar deta hai:

| `target` | `baseUrl` kya banega |
|---|---|
| `local` | `{{localUrl}}` |
| `stage` | `{{stageUrl}}` |
| `prod`  | `{{prodUrl}}` |

## Token

Har folder ka **pehla login request** chalao — token apne aap save ho jata hai:

| Folder | Request | Kya save hota hai |
|---|---|---|
| Customer | `01 Auth → 06 Login with password` | `customerToken`, `customerId` |
| Vendor | `01 Auth → 01 Vendor login` | `vendorToken`, `vendorId` |
| Admin | `01 Auth → 01 Admin login` | `adminToken`, `adminId` |

Manually kuch paste nahi karna. Aage ki requests bhi chain me id save karti jaati hain
(`categoryId`, `subCategoryId`, `productId`, `locationId`, `orderId`, `branchId`,
`serviceAreaId`, `bannerId`, `termId`, `privacyId`, `otpSessionId`) —
isliye requests **upar se neeche** chalao.

## Stage ke test accounts

| Role | Login | Password | Kya expect karein |
|---|---|---|---|
| admin | `ricemartnvs@gmail.com` | `Admin@123` | platform summary, 1 vendor |
| vendor | `nagraj@gmail.com` | `nagraj@123` | apna order queue + 30 products |
| customer (in-area) | `9886061450` | `Stage@123` | 577001 → catalog `200` |
| customer (out-of-area) | `9620508145` | `Stage@123` | `404 PINCODE_NOT_SERVICEABLE` |
| customer (no address) | `8660222341` | `Stage@123` | `400 PINCODE_REQUIRED` |

---

## Saved examples kahan se aaye

Har request ka **200/201 example save hai** aur wo **StageDB pe asli call maar ke**
record kiya gaya hai — koi haath ka likha nahi.

`capture.js` in-process express server start karta hai (asli routes, controllers,
services, DB) aur:

- **Read endpoints** stage ke asli data pe chalte hain (Nagraj Mart, pincode 577001)
- **Write endpoints** apna alag bubble banate hain — 2 temp vendor, 1 temp customer,
  temp catalog aur 3 temp orders (ek poora `PENDING → DELIVERED`, ek `REJECTED`,
  ek `CANCELLED`) — aur aakhir me **sab delete ho jata hai**, `orderNumber` counter
  bhi wapas wahin set ho jata hai jahan tha.

**Sirf 4 OTP endpoints** ke examples documented hain (`loginOrSignin-with-mobile`,
`verify-otp-mobile`, `loginOrSignin-with-email`, `verify-otp-email`) — unhe chalane pe
asli SMS/email chala jata hai aur OTP verify nahi ho sakta. Un requests ki description
me ye saaf likha hua hai, aur example ka naam `200 · OK (documented)` hai.

---

## Dobara generate kaise karein

```bash
cd server

# 1. stage se asli responses record karo (temp data apne aap saaf ho jata hai)
DISABLE_PUSH=true node postman/capture.js

# 2. spec + examples se collection + environment banao
node postman/build.js

# 3. sab sahi hai ya nahi, check karo
node postman/verify.js
```

`capture.js` **PROD DB pe chalne se mana kar deta hai** (db name me `prod` mile to abort).

### Kuch badla to kya karna hai

| Kya badla | Kya karna hai |
|---|---|
| Kisi endpoint ki body / description / enum | `spec/*.js` edit karo → `build.js` |
| Naya endpoint add hua | `spec/*.js` me entry + `capture.js` me ek `rec(...)` call → `capture.js` → `build.js` |
| Response ka shape badla | `capture.js` → `build.js` |
| Kuch bhi | aakhir me hamesha `verify.js` |

`verify.js` khud server ke `routes/` padhta hai, isliye naya route add karke collection
me daalna bhool gaye to wo pakad lega.

---

## Related docs

- `docs/api_changes_for_frontend.md` — kya-kya badla, per-team checklist ke saath
- `docs/vendor_base_platform.md` — design doc, decisions D1–D23
- `docs/migration_runbook.md` — prod migration ka runbook aur rehearsal me mile issues
