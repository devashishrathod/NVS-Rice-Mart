/**
 * CUSTOMER (mobile app) — login se lekar delivery tak, exact sequence me.
 *
 * Har request ka `id` capture.js ke recorded example se match hona chahiye.
 */
const {
  TAG,
  E,
  paging,
  serviceCtx,
  describe,
  saveToken,
  saveFirstId,
  saveId,
  expectStatus,
} = require("./shared");

const AUTH_CUSTOMER = "`Bearer {{customerToken}}` — role `user`";

module.exports = [
  // ══════════════════════════════════════════════════════════════
  // 01 AUTH
  // ══════════════════════════════════════════════════════════════
  {
    id: "cust.auth.register",
    group: "01 Auth",
    name: "01 · Register (email + password)",
    method: "POST",
    path: "/auth/register",
    auth: null,
    tag: TAG.CHANGED,
    body: {
      type: "json",
      value: {
        name: "Ramesh Kulkarni",
        email: "ramesh.kulkarni@gmail.com",
        mobile: "9886061450",
        password: "Ramesh@123",
        loginType: "password",
        fcmToken: "fMEp9x0hQ1y:APA91bH_sample_device_token",
      },
    },
    desc: describe({
      tag: TAG.CHANGED,
      summary:
        "Naya customer account banata hai aur seedha JWT token wapas deta hai (OTP ki zaroorat nahi).",
      auth: "Public",
      when: ["App pe 'Sign up' screen — OTP flow ka alternative."],
      notes: [
        "**Breaking:** `role` ab body se accept **nahi** hota. Pehle koi bhi `\"role\": \"admin\"` bhej ke admin account bana leta tha — ye security hole band kar diya gaya hai. Ye endpoint hamesha `role: \"user\"` banata hai.",
        "Vendor account admin banata hai (`POST /vendors/create`), admin account seedha DB me — dono yahan se nahi bante.",
        "`email` ya `mobile` — koi ek zaroori hai.",
        "Ek hi mobile alag-alag role me ho sakta hai (unique index `{mobile, role}` pe hai), isliye same number vendor aur customer dono ka ho sakta hai.",
      ],
      fields: [
        ["name", "string", "no", "`Ramesh Kulkarni`"],
        ["email", "string", "email ya mobile", "`ramesh.kulkarni@gmail.com`"],
        ["mobile", "string", "email ya mobile", "`9886061450` — 10 digit"],
        ["password", "string", "yes", "`Ramesh@123`"],
        ["loginType", "enum", "no", "default `password`"],
        ["fcmToken", "string", "no", "Push notification ke liye device token"],
      ],
      enums: [
        [
          "loginType",
          "`email` · `mobile` · `google` · `password` · `other`",
          "Sirf record ke liye — auth logic isse nahi badalti",
        ],
      ],
      errors: [
        ["400", "—", "Is email/mobile ka user already hai"],
        E.VALIDATION,
      ],
    }),
    script: saveToken("customerToken", "customerId").map((l) =>
      l.replace('"200 OK + token mila"', '"201 Created + token mila"').replace(
        "pm.response.to.have.status(200)",
        "pm.response.to.have.status(201)",
      ),
    ),
  },

  {
    id: "cust.auth.otpMobileSend",
    group: "01 Auth",
    name: "02 · Login/Signup se OTP bhejo (mobile)",
    method: "POST",
    path: "/auth/loginOrSignin-with-mobile",
    auth: null,
    tag: TAG.CHANGED,
    body: {
      type: "json",
      value: { mobile: "9886061450", loginType: "mobile" },
    },
    desc: describe({
      tag: TAG.CHANGED,
      summary:
        "Mobile pe OTP bhejta hai. User pehle se ho ya na ho — dono case handle karta hai (`isFirst` batata hai naya bana ya purana tha).",
      auth: "Public",
      when: ["App ka **pehla** step — mobile number screen."],
      notes: [
        "**Breaking:** `role` ab body se accept **nahi** hota — account hamesha `user` banta hai. Pehle `\"role\": \"admin\"` bhej ke koi bhi admin ban sakta tha, phir verify-otp se admin token le leta tha.",
        "Response ka `otpData.Details` hi **sessionId** hai — usko agle step (`verify-otp-mobile`) me bhejna padta hai. Iss request ka test script `{{otpSessionId}}` me apne aap save kar deta hai.",
        "`isFirst: true` ka matlab naya account bana — app ko onboarding (naam + address) dikhani chahiye.",
        "Stage/local pe SMS actually jaata hai (2Factor). Testing ke liye `POST /auth/login` (password) use karna behtar hai.",
      ],
      fields: [
        ["mobile", "string", "yes", "`9886061450` — 10 digit"],
        ["loginType", "enum", "no", "default `mobile`"],
      ],
      errors: [E.VALIDATION],
    }),
    script: [
      "const j = pm.response.json();",
      "const sid = j && j.data && j.data.otpData && j.data.otpData.Details;",
      "if (sid) {",
      '    pm.environment.set("otpSessionId", sid);',
      '    console.log("✅ otpSessionId =", sid);',
      "}",
      "",
      'pm.test("200 OK", () => pm.response.to.have.status(200));',
    ],
  },

  {
    id: "cust.auth.otpMobileVerify",
    group: "01 Auth",
    name: "03 · OTP verify karo (mobile) → token",
    method: "PUT",
    path: "/auth/verify-otp-mobile",
    auth: null,
    tag: TAG.CHANGED,
    body: {
      type: "json",
      value: {
        mobile: "9886061450",
        otp: "123456",
        sessionId: "{{otpSessionId}}",
        loginType: "mobile",
        currentScreen: "HOME",
        fcmToken: "fMEp9x0hQ1y:APA91bH_sample_device_token",
      },
    },
    desc: describe({
      tag: TAG.CHANGED,
      summary: "OTP verify karke JWT token deta hai. Yahi se app login hota hai.",
      auth: "Public",
      when: ["Step 02 ke turant baad."],
      notes: [
        "**Breaking:** `role` ab ignore hota hai — token hamesha `user` ka milta hai. Vendor/admin ko `POST /auth/login` use karna padega.",
        "`sessionId` step 02 ke response ke `data.otpData.Details` se aata hai.",
        "Success pe `data.token` milta hai — ise app securely store kare aur har request me `Authorization: Bearer <token>` bheje.",
      ],
      fields: [
        ["mobile", "string", "yes", "`9886061450`"],
        ["otp", "string", "yes", "`123456` — SMS wala 6 digit"],
        ["sessionId", "string", "yes", "step 02 ka `otpData.Details`"],
        ["loginType", "enum", "no", "default `mobile`"],
        ["currentScreen", "string", "no", "`HOME` — analytics ke liye"],
        ["fcmToken", "string", "no", "Device push token"],
      ],
      errors: [
        ["400", "—", "Invalid OTP"],
        ["404", "—", "Is mobile ka customer nahi mila"],
        E.VALIDATION,
      ],
    }),
    script: saveToken("customerToken", "customerId"),
  },

  {
    id: "cust.auth.otpEmailSend",
    group: "01 Auth",
    name: "04 · Login/Signup se OTP bhejo (email)",
    method: "POST",
    path: "/auth/loginOrSignin-with-email",
    auth: null,
    tag: TAG.CHANGED,
    body: { type: "json", value: { email: "ramesh.kulkarni@gmail.com", loginType: "email" } },
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Email pe 6-digit OTP mail karta hai.",
      auth: "Public",
      when: ["Mobile OTP ka alternative — email se login."],
      notes: [
        "**Breaking:** `role` body se hata diya gaya — hamesha `user`.",
        "Yahan `sessionId` nahi hota — OTP DB me store hota hai, isliye verify me sirf `email + otp` bhejna hai.",
      ],
      fields: [
        ["email", "string", "yes", "`ramesh.kulkarni@gmail.com`"],
        ["loginType", "enum", "no", "default `email`"],
      ],
      errors: [E.VALIDATION],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.auth.otpEmailVerify",
    group: "01 Auth",
    name: "05 · OTP verify karo (email) → token",
    method: "PUT",
    path: "/auth/verify-otp-email",
    auth: null,
    tag: TAG.CHANGED,
    body: {
      type: "json",
      value: {
        email: "ramesh.kulkarni@gmail.com",
        otp: "482913",
        loginType: "email",
        currentScreen: "HOME",
        fcmToken: "fMEp9x0hQ1y:APA91bH_sample_device_token",
      },
    },
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Email OTP verify karke JWT token deta hai.",
      auth: "Public",
      when: ["Step 04 ke turant baad."],
      notes: [
        "**Breaking:** `role` ignore — token hamesha `user` ka.",
        "OTP 10 minute me expire ho jata hai → `410 OTP expired`.",
      ],
      fields: [
        ["email", "string", "yes", "`ramesh.kulkarni@gmail.com`"],
        ["otp", "string", "yes", "`482913`"],
        ["loginType", "enum", "no", "default `email`"],
        ["currentScreen", "string", "no", "`HOME`"],
        ["fcmToken", "string", "no", "Device push token"],
      ],
      errors: [
        ["403", "—", "Invalid OTP"],
        ["410", "—", "OTP expire ho gaya"],
        ["404", "—", "User ya OTP nahi mila"],
      ],
    }),
    script: saveToken("customerToken", "customerId"),
  },

  {
    id: "cust.auth.login",
    group: "01 Auth",
    name: "06 · ⭐ Login with password (testing ke liye yahi use karo)",
    method: "POST",
    path: "/auth/login",
    auth: null,
    tag: TAG.SAME,
    body: {
      type: "json",
      value: {
        type: "mobile",
        mobile: "9886061450",
        password: "Stage@123",
        role: "user",
        loginType: "password",
        fcmToken: "fMEp9x0hQ1y:APA91bH_sample_device_token",
      },
    },
    desc: describe({
      tag: TAG.SAME,
      summary:
        "Password se login. **Stage testing ke liye sabse aasan** — SMS/email ka wait nahi karna padta.",
      auth: "Public",
      when: ["Sabse pehla call. Token `{{customerToken}}` me apne aap save ho jata hai."],
      notes: [
        "`type` batata hai lookup email se karna hai ya mobile se: `\"type\": \"email\"` → `email` field bhejo, `\"type\": \"mobile\"` → `mobile` field bhejo.",
        "`role` yahan sirf **lookup** ke liye hai (unique index `{mobile, role}` pe hai). Naya account yahan se banta hi nahi aur password verify hota hai — isliye ye safe hai.",
        "**Stage credentials** — `9886061450` / `Stage@123` (pincode 577001, catalog dikhega), `9620508145` / `Stage@123` (bahar ka pincode → 404), `8660222341` / `Stage@123` (koi address nahi → 400).",
      ],
      fields: [
        ["type", "enum", "yes", "`mobile` ya `email`"],
        ["mobile", "string", "type=mobile pe", "`9886061450`"],
        ["email", "string", "type=email pe", "`ramesh.kulkarni@gmail.com`"],
        ["password", "string", "yes", "`Stage@123`"],
        ["role", "enum", "no", "default `user`"],
        ["loginType", "enum", "no", "default `password`"],
        ["fcmToken", "string", "no", "Device push token"],
      ],
      enums: [
        ["type", "`mobile` · `email`", "Kis field se user dhoondna hai"],
        ["role", "`user` · `vendor` · `admin` · `staff`", "Customer ke liye `user`"],
      ],
      errors: [
        ["403", "—", "Wrong password"],
        ["404", "—", "Is mobile/email + role ka user nahi mila"],
        ["422", "—", "`type` ke hisaab se required field missing"],
      ],
    }),
    script: saveToken("customerToken", "customerId"),
  },

  // ══════════════════════════════════════════════════════════════
  // 02 PROFILE
  // ══════════════════════════════════════════════════════════════
  {
    id: "cust.user.me",
    group: "02 Profile",
    name: "07 · Meri profile",
    method: "GET",
    path: "/users/get",
    auth: "customerToken",
    tag: TAG.CHANGED,
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Logged-in customer ki apni profile.",
      auth: AUTH_CUSTOMER,
      when: ["Login ke turant baad — naam/photo header me dikhane ke liye."],
      notes: [
        "**Breaking:** `?userId=` query param **hata diya gaya**. Pehle koi bhi customer kisi aur ka `userId` bhej ke uski poori profile (email, mobile) padh leta tha — IDOR fix. Ab hamesha token wale user ki hi profile aati hai.",
        "Admin ko doosre user ki profile chahiye to ab `GET /users/get?userId=` **admin-only** hai (Admin folder me).",
      ],
      errors: [E.UNAUTH],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.user.update",
    group: "02 Profile",
    name: "08 · Profile update karo",
    method: "PUT",
    path: "/users/update",
    auth: "customerToken",
    tag: TAG.SAME,
    body: {
      type: "formdata",
      fields: [
        { key: "name", value: "Ramesh Kulkarni", type: "text", description: "2–100 chars" },
        { key: "dob", value: "1992-08-14", type: "text", description: "ISO date `YYYY-MM-DD`" },
        { key: "email", value: "ramesh.kulkarni@gmail.com", type: "text", description: "Valid email" },
        { key: "mobile", value: "9886061450", type: "text", description: "10 digit" },
        { key: "image", value: "", type: "file", description: "Profile photo (optional) — Cloudinary pe jati hai" },
      ],
    },
    desc: describe({
      tag: TAG.SAME,
      summary: "Apna naam / DOB / email / mobile / profile photo update karo.",
      auth: AUTH_CUSTOMER,
      when: ["Profile screen se."],
      notes: [
        "**`multipart/form-data`** hai (JSON nahi) kyunki isme photo upload hota hai. Photo na bhejni ho to `image` field disable kar do — baaki fields text hi rehte hain.",
        "Saare fields optional hain — jo bhejoge wahi update hoga.",
        "`image` Cloudinary pe upload hoti hai, isliye stage pe test karte waqt bhi asli account me file jaayegi.",
      ],
      fields: [
        ["name", "string", "no", "`Ramesh Kulkarni` (2–100)"],
        ["dob", "date", "no", "`1992-08-14`"],
        ["email", "string", "no", "`ramesh.kulkarni@gmail.com`"],
        ["mobile", "number", "no", "`9886061450` — exactly 10 digit"],
        ["image", "file", "no", "jpg/png"],
      ],
      errors: [E.VALIDATION, E.UNAUTH],
    }),
    script: expectStatus(200),
  },

  // ══════════════════════════════════════════════════════════════
  // 03 ADDRESS
  // ══════════════════════════════════════════════════════════════
  {
    id: "cust.area.check",
    group: "03 Address",
    name: "09 · 🆕 Pincode serviceable hai ya nahi",
    method: "GET",
    path: "/service-areas/check",
    auth: "customerToken",
    tag: TAG.NEW,
    query: [
      { key: "zipcode", value: "577001", description: "6 digit Indian PIN code" },
    ],
    desc: describe({
      tag: TAG.NEW,
      summary:
        "Batata hai ki is pincode pe hum deliver karte hain ya nahi, aur karte hain to kaun sa vendor.",
      auth: AUTH_CUSTOMER,
      when: [
        "Address **save karne se pehle** — taaki user ko turant \"✅ hum yahan deliver karte hain\" ya \"❌ abhi nahi\" dikha sako.",
        "Onboarding screen pe pincode type karte hi.",
      ],
      notes: [
        "Ye endpoint kabhi 404 nahi deta — hamesha 200 deta hai `serviceable: true/false` ke saath. Isliye ise error handling ke bina call kar sakte ho.",
        "`serviceable: true` pe `vendor.shopName` bhi aata hai — usko \"Nagraj Mart aapke area me deliver karta hai\" jaise message me dikha sakte ho.",
        "Ek pincode pe hamesha **ek hi** vendor hota hai (exclusive territory rule).",
      ],
      query: [["zipcode", "`577001` — required, 6 digit"]],
      errors: [E.UNAUTH, ["422", "—", "`zipcode` missing ya invalid"]],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.loc.create",
    group: "03 Address",
    name: "10 · Naya address add karo",
    method: "POST",
    path: "/locations/create",
    auth: "customerToken",
    tag: TAG.CHANGED,
    body: {
      type: "json",
      value: {
        name: "Ghar",
        shopOrBuildingNumber: "12-B",
        area: "Vidyanagar",
        address: "12-B, Shivam Residency, Vidyanagar Main Road",
        city: "Davangere",
        district: "Davangere",
        state: "Karnataka",
        country: "India",
        zipcode: "577001",
        coordinates: [14.4644, 75.9218],
      },
    },
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Customer ka delivery address save karta hai.",
      auth: AUTH_CUSTOMER,
      when: [
        "Step 09 (serviceable check) ke baad.",
        "Pehla address save hote hi **poora catalog unlock** ho jata hai.",
      ],
      notes: [
        "**Sabse pehla address apne aap `isDefault: true` ban jata hai.** Default address hi decide karta hai ki customer ko kaunse vendor ka catalog dikhega.",
        "**Removed fields:** `isProductAddress` aur `isVendorAddress` ab schema me hain hi nahi — bhejoge to ignore ho jayenge. Vendor branch ab `type: \"VENDOR_BRANCH\"` se pehchana jata hai aur sirf admin bana sakta hai.",
        "`coordinates` **`[latitude, longitude]`** order me hai. Ye delivery distance nikalne ke liye use hote hain — galat order me bhejoge to charge galat aayega.",
        "`coordinates` de diye to address text fields optional ho jate hain (reverse-geocode ho jata hai); coordinates na do to `address, city, district, state, zipcode` required hain.",
        "`userId` body me mat bhejo — token se apne aap lagta hai.",
      ],
      fields: [
        ["name", "string", "no", "`Ghar` / `Office` — address ka label"],
        ["shopOrBuildingNumber", "string", "no", "`12-B`"],
        ["area", "string", "no", "`Vidyanagar`"],
        ["address", "string", "coords na ho to yes", "`12-B, Shivam Residency, Vidyanagar Main Road`"],
        ["city", "string", "coords na ho to yes", "`Davangere`"],
        ["district", "string", "coords na ho to yes", "`Davangere`"],
        ["state", "string", "coords na ho to yes", "`Karnataka`"],
        ["zipcode", "string", "coords na ho to yes", "`577001`"],
        ["country", "string", "no", "`India` (default)"],
        ["coordinates", "number[2]", "no", "`[14.4644, 75.9218]` = **[latitude, longitude]**"],
      ],
      errors: [E.VALIDATION, E.UNAUTH],
    }),
    script: saveId("locationId", "data", 201),
  },

  {
    id: "cust.loc.getAll",
    group: "03 Address",
    name: "11 · Mere saare address",
    method: "GET",
    path: "/locations/getAll",
    auth: "customerToken",
    tag: TAG.LOCKED,
    query: paging([
      { key: "isDefault", value: "true", description: "Sirf default address", disabled: true },
      { key: "zipcode", value: "577001", description: "Pincode se filter", disabled: true },
      { key: "city", value: "Davangere", description: "City se filter", disabled: true },
    ]),
    desc: describe({
      tag: TAG.LOCKED,
      summary: "Customer ke saved addresses ki list (address book screen).",
      auth: AUTH_CUSTOMER,
      when: ["Checkout se pehle address chunne ke liye.", "Profile → 'My Addresses' screen."],
      notes: [
        "**Security fix:** pehle ye endpoint **sabke** addresses laut deta tha — koi bhi customer poora address book padh sakta tha. Ab customer ko sirf apne addresses milte hain (admin ko sab dikhte hain).",
        "Response ke har address me `isDefault` flag hai — UI me usi pe tick lagao.",
        "`type` hamesha `CUSTOMER` aayega; `VENDOR_BRANCH` wale customer ko kabhi nahi dikhte.",
      ],
      errors: [E.UNAUTH],
    }),
    script: saveFirstId("locationId", "data.data"),
  },

  {
    id: "cust.loc.get",
    group: "03 Address",
    name: "12 · Ek address padho",
    method: "GET",
    path: "/locations/get/{{locationId}}",
    auth: "customerToken",
    tag: TAG.LOCKED,
    desc: describe({
      tag: TAG.LOCKED,
      summary: "Ek address ki full detail.",
      auth: AUTH_CUSTOMER,
      when: ["Address edit screen kholne se pehle."],
      notes: [
        "**Security fix:** ab doosre customer ka address id daalne pe `404` milta hai (pehle mil jata tha).",
      ],
      errors: [E.NOT_FOUND, E.UNAUTH],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.loc.update",
    group: "03 Address",
    name: "13 · 🆕 Address edit karo",
    method: "PUT",
    path: "/locations/update/{{locationId}}",
    auth: "customerToken",
    tag: TAG.NEW,
    body: {
      type: "json",
      value: {
        name: "Ghar",
        shopOrBuildingNumber: "14-A",
        area: "Vidyanagar",
        address: "14-A, Shivam Residency, Vidyanagar Main Road",
        city: "Davangere",
        district: "Davangere",
        state: "Karnataka",
        zipcode: "577001",
        coordinates: [14.4644, 75.9218],
        isDefault: true,
      },
    },
    desc: describe({
      tag: TAG.NEW,
      summary: "Saved address ko edit karta hai. Ye route pehle **comment out** tha — controller file khaali padi thi.",
      auth: AUTH_CUSTOMER,
      when: ["Address book → Edit."],
      notes: [
        "Kam se kam **1 field** bhejna zaroori hai.",
        "`isDefault: true` bhejne pe baaki addresses ka default apne aap hat jata hai (ek hi default reh sakta hai).",
        "**⚠️ `zipcode` badalna = vendor badalna.** Agar naya pincode kisi doosre vendor ka hai to customer ka catalog aur cart dono badal jayenge — app ko cart re-verify karana chahiye.",
      ],
      fields: [
        ["name", "string", "no", "`Ghar`"],
        ["shopOrBuildingNumber", "string", "no", "`14-A`"],
        ["address / area / city / district / state / zipcode", "string", "no", "koi bhi address field"],
        ["country", "string", "no", "`India`"],
        ["coordinates", "number[2]", "no", "`[14.4644, 75.9218]` — [latitude, longitude]"],
        ["isDefault", "boolean", "no", "`true` → ise default bana do"],
      ],
      errors: [
        ["422", "—", "Ek bhi field nahi bheja"],
        E.NOT_FOUND,
        E.UNAUTH,
      ],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.loc.setDefault",
    group: "03 Address",
    name: "14 · 🆕 Ise default address bana do",
    method: "PUT",
    path: "/locations/set-default/{{locationId}}",
    auth: "customerToken",
    tag: TAG.NEW,
    desc: describe({
      tag: TAG.NEW,
      summary:
        "Address book se ek address ko default bana deta hai. Body ki zaroorat nahi.",
      auth: AUTH_CUSTOMER,
      when: [
        "Address book screen se address switch karte waqt.",
        "Checkout pe 'Deliver to' badalne pe.",
      ],
      notes: [
        "**Ye sirf address nahi badalta — poora catalog badal deta hai.** Default address ka pincode hi vendor decide karta hai.",
        "Isliye iske turant baad app ko `GET /categories/getAll` dobara call karna chahiye aur cart ko `POST /carts/verify-delivery` se re-verify karna chahiye.",
        "Naya default agar doosre vendor ka pincode hai to purana cart `409 CART_VENDOR_CONFLICT` de sakta hai.",
      ],
      errors: [E.NOT_FOUND, E.UNAUTH],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.loc.delete",
    group: "03 Address",
    name: "15 · Address delete karo",
    method: "DELETE",
    path: "/locations/delete/{{locationId}}",
    auth: "customerToken",
    tag: TAG.CHANGED,
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Address soft-delete karta hai.",
      auth: AUTH_CUSTOMER,
      when: ["Address book → Delete."],
      notes: [
        "**Fix:** pehle default address delete karne pe customer bina default ke reh jata tha aur uska catalog ekdum `400 PINCODE_REQUIRED` dene lagta tha. Ab default delete karo to **agla address apne aap default ban jata hai**.",
        "Aakhri address delete karne pe customer ke paas koi address nahi bachta → catalog `400 PINCODE_REQUIRED` dega, jo sahi behaviour hai (app onboarding screen dikhaye).",
        "Soft delete hai — purane orders ka delivery address safe rehta hai.",
      ],
      errors: [E.NOT_FOUND, E.UNAUTH],
    }),
    script: expectStatus(200),
  },

  // ══════════════════════════════════════════════════════════════
  // 04 CATALOG
  // ══════════════════════════════════════════════════════════════
  {
    id: "cust.cat.getAll",
    group: "04 Catalog",
    name: "16 · Categories (vendor-scoped)",
    method: "GET",
    path: "/categories/getAll",
    auth: "customerToken",
    tag: TAG.CHANGED,
    query: paging([
      ...serviceCtx(),
      { key: "isActive", value: "true", description: "Sirf active", disabled: true },
    ]),
    desc: describe({
      tag: TAG.CHANGED,
      summary:
        "Customer ke pincode wale vendor ki categories. **Home screen ka pehla data call.**",
      auth: AUTH_CUSTOMER,
      when: ["Login + address set hone ke baad — home screen."],
      notes: [
        "**Sabse bada change:** response ab **vendor-scoped** hai. Pehle poore platform ki saari categories aati thi; ab sirf us vendor ki jo customer ke pincode pe deliver karta hai.",
        "Vendor kaise decide hota hai — priority order: `?locationId=` > `?zipcode=` > customer ka **default address**. Tino na ho to `400 PINCODE_REQUIRED`.",
        "App ko ye teen states handle karni **hi** hongi: `200` (catalog), `400 PINCODE_REQUIRED` (address add screen), `404 PINCODE_NOT_SERVICEABLE` (coming soon screen).",
        "`?userId=` / `?vendorId=` client se bhejne ka koi fayda nahi — server scope **last me** apply karta hai, isliye client se override nahi ho sakta.",
      ],
      query: [
        ["zipcode", "`577001` — default address override karne ke liye"],
        ["locationId", "Saved address ka id — sabse zyada priority"],
        ["page / limit / search / sortBy / sortOrder", "Standard paging"],
      ],
      errors: [E.PINCODE_REQUIRED, E.PINCODE_NOT_SERVICEABLE, E.UNAUTH],
    }),
    script: saveFirstId("categoryId", "data.data"),
  },

  {
    id: "cust.cat.get",
    group: "04 Catalog",
    name: "17 · Ek category",
    method: "GET",
    path: "/categories/get/{{categoryId}}",
    auth: "customerToken",
    tag: TAG.CHANGED,
    query: serviceCtx(),
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Ek category ki detail — vendor scope ke saath.",
      auth: AUTH_CUSTOMER,
      when: ["Category tile pe tap karne pe (agar detail chahiye)."],
      notes: [
        "Doosre vendor ki category ka id daaloge to `404` milega — leak nahi hoti.",
      ],
      errors: [E.PINCODE_REQUIRED, E.PINCODE_NOT_SERVICEABLE, E.NOT_FOUND],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.sub.getAll",
    group: "04 Catalog",
    name: "18 · SubCategories (category ke andar)",
    method: "GET",
    path: "/subCategories/getAll",
    auth: "customerToken",
    tag: TAG.CHANGED,
    query: paging([
      { key: "categoryId", value: "{{categoryId}}", description: "Parent category — step 16 se" },
      ...serviceCtx(),
    ]),
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Chuni hui category ki subcategories.",
      auth: AUTH_CUSTOMER,
      when: ["Step 16 ke baad — category tap karne pe."],
      notes: [
        "Categories ki tarah hi **vendor-scoped**.",
        "`?categoryId=` na do to vendor ki saari subcategories aa jayengi.",
      ],
      query: [
        ["categoryId", "Parent category ka id"],
        ["zipcode / locationId", "Service context (optional)"],
      ],
      errors: [E.PINCODE_REQUIRED, E.PINCODE_NOT_SERVICEABLE],
    }),
    script: saveFirstId("subCategoryId", "data.data"),
  },

  {
    id: "cust.sub.get",
    group: "04 Catalog",
    name: "19 · Ek subcategory",
    method: "GET",
    path: "/subCategories/get/{{subCategoryId}}",
    auth: "customerToken",
    tag: TAG.CHANGED,
    query: serviceCtx(),
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Ek subcategory ki detail — vendor scope ke saath.",
      auth: AUTH_CUSTOMER,
      when: ["Subcategory header dikhane ke liye."],
      errors: [E.PINCODE_REQUIRED, E.PINCODE_NOT_SERVICEABLE, E.NOT_FOUND],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.prod.getAll",
    group: "04 Catalog",
    name: "20 · Products list",
    method: "GET",
    path: "/products/getAll",
    auth: "customerToken",
    tag: TAG.CHANGED,
    query: paging([
      { key: "subCategoryId", value: "{{subCategoryId}}", description: "Step 18 se" },
      { key: "categoryId", value: "{{categoryId}}", description: "Category se filter", disabled: true },
      ...serviceCtx(),
      { key: "minPrice", value: "100", description: "Price filter", disabled: true },
      { key: "maxPrice", value: "5000", description: "Price filter", disabled: true },
      { key: "brand", value: "India Gate", description: "Brand se filter", disabled: true },
      { key: "type", value: "grocery", description: "`grocery` | `electronics` | `clothing`", disabled: true },
    ]),
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Product listing screen ka data — vendor ke apne products.",
      auth: AUTH_CUSTOMER,
      when: ["Step 18 ke baad — subcategory tap karne pe."],
      notes: [
        "**Breaking:** `productLocations[]` array response se **hata diya gaya**. Pehle price aur stock us array ke andar location-wise hote the; ab `Product` document pe hi hain — `generalPrice` aur `stockQuantity`.",
        "`ProductLocation` model hi delete ho chuka hai — app me uska koi mapping bacha ho to hata do.",
        "Listing hamesha vendor-scoped hai. Doosre vendor ke products kabhi nahi aate.",
        "`sortBy` sirf inhi pe chalta hai: `generalPrice`, `createdAt`, `stockQuantity`, `weightInKg`.",
      ],
      query: [
        ["subCategoryId / categoryId", "Catalog drill-down"],
        ["minPrice / maxPrice", "Price range"],
        ["minWeight / maxWeight", "Weight range"],
        ["minStock / maxStock", "Stock range"],
        ["brand / SKU / name / search", "Text filters"],
        ["type", "`grocery` · `electronics` · `clothing`"],
        ["zipcode / locationId", "Service context"],
      ],
      enums: [
        ["type", "`grocery` · `electronics` · `clothing`", "Product ka type"],
        [
          "sortBy",
          "`generalPrice` · `createdAt` · `stockQuantity` · `weightInKg`",
          "Isse bahar kuch bheja to 422",
        ],
      ],
      errors: [E.PINCODE_REQUIRED, E.PINCODE_NOT_SERVICEABLE],
    }),
    script: saveFirstId("productId", "data.data"),
  },

  {
    id: "cust.prod.get",
    group: "04 Catalog",
    name: "21 · Product detail",
    method: "GET",
    path: "/products/get/{{productId}}",
    auth: "customerToken",
    tag: TAG.CHANGED,
    query: serviceCtx(),
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Ek product ki poori detail — PDP screen.",
      auth: AUTH_CUSTOMER,
      when: ["Product card pe tap karne pe."],
      notes: [
        "`generalPrice` = bechne wali price, `stockQuantity` = available stock, `weightInKg` = delivery charge ka input.",
        "Doosre vendor ka product id daaloge to `404 PRODUCT_NOT_AVAILABLE_HERE`.",
      ],
      errors: [
        E.PRODUCT_NOT_AVAILABLE_HERE,
        E.PINCODE_REQUIRED,
        E.PINCODE_NOT_SERVICEABLE,
      ],
    }),
    script: expectStatus(200),
  },

  // ══════════════════════════════════════════════════════════════
  // 05 CART
  // ══════════════════════════════════════════════════════════════
  {
    id: "cust.cart.add",
    group: "05 Cart",
    name: "22 · Cart me item add / quantity update",
    method: "POST",
    path: "/carts/add-or-update",
    auth: "customerToken",
    tag: TAG.CHANGED,
    query: [
      {
        key: "replaceCart",
        value: "true",
        description:
          "409 CART_VENDOR_CONFLICT aane ke baad, user ke 'Yes, clear cart' bolne pe ye bhejo",
        disabled: true,
      },
    ],
    body: { type: "json", value: { productId: "{{productId}}", quantity: 2 } },
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Cart me product daalta hai ya uski quantity set karta hai.",
      auth: AUTH_CUSTOMER,
      when: ["PDP / listing pe '+ Add' ya quantity stepper dabane pe."],
      notes: [
        "`quantity` **set** hoti hai, add nahi — `quantity: 3` bhejoge to cart me 3 ho jayengi (4 nahi). `quantity: 0` bhejna item hatane ke barabar hai.",
        "**🆕 Ek cart = ek vendor.** Cart me pehle se kisi doosre vendor ka item hai to `409 CART_VENDOR_CONFLICT` milega. Response me purane vendor ka naam aata hai — app dialog dikhaye: *\"Aapke cart me Nagraj Mart ke items hain. Clear karke naya item add karein?\"*. User 'haan' bole to wahi request `?replaceCart=true` ke saath dobara bhejo.",
        "Stock se zyada quantity maangi to `409 STOCK_UNAVAILABLE`.",
        "**Removed:** `Cart.items[].vendorId` field hata di gayi — vendor ab cart level pe ek hi hai.",
      ],
      fields: [
        ["productId", "ObjectId", "yes", "`{{productId}}`"],
        ["quantity", "number", "yes", "`2` — 0 se 100 tak. Final quantity, increment nahi"],
      ],
      query: [["replaceCart", "`true` → purana cart clear karke ye item daal do"]],
      errors: [
        E.CART_VENDOR_CONFLICT,
        E.STOCK_UNAVAILABLE,
        E.PRODUCT_NOT_AVAILABLE_HERE,
        E.PINCODE_REQUIRED,
        E.PINCODE_NOT_SERVICEABLE,
      ],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.cart.get",
    group: "05 Cart",
    name: "23 · Mera cart",
    method: "GET",
    path: "/carts/get",
    auth: "customerToken",
    tag: TAG.CHANGED,
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Current cart — items, subtotal, total weight, total quantity.",
      auth: AUTH_CUSTOMER,
      when: ["Cart screen kholne pe.", "Har add/remove ke baad refresh."],
      notes: [
        "**Breaking:** `?userId=` query param **hata diya gaya** — koi bhi customer kisi aur ka cart padh leta tha (IDOR fix). Ab hamesha apna hi cart aata hai.",
        "`subTotal` sirf items ka total hai — **delivery charge isme nahi hai**. Payable amount ke liye `POST /orders/preview` call karo.",
        "Cart khaali hone pe bhi 200 aata hai, bas `items: []` hota hai.",
      ],
      errors: [E.UNAUTH],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.cart.remove",
    group: "05 Cart",
    name: "24 · Item hatao / quantity ghatao",
    method: "PUT",
    path: "/carts/remove/{{productId}}",
    auth: "customerToken",
    tag: TAG.SAME,
    body: { type: "json", value: { action: "decrease" } },
    desc: describe({
      tag: TAG.SAME,
      summary: "Cart se item nikalta hai ya uski quantity 1 kam karta hai.",
      auth: AUTH_CUSTOMER,
      when: ["Cart screen ke '−' button pe (`decrease`) ya delete icon pe (`remove`)."],
      notes: [
        "`\"action\": \"decrease\"` → quantity 1 kam; 1 se 0 hui to item apne aap nikal jata hai.",
        "`\"action\": \"remove\"` → item poora hata do.",
        "Aakhri item nikalne pe cart ke `vendorId` aur `deliveryZipcode` bhi hat jate hain — cart neutral ho jata hai.",
      ],
      fields: [["action", "enum", "yes", "`remove` ya `decrease`"]],
      enums: [
        ["action", "`remove` · `decrease`", "`remove` = poora item hatao, `decrease` = 1 kam karo"],
      ],
      errors: [E.NOT_FOUND, E.VALIDATION],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.cart.verify",
    group: "05 Cart",
    name: "25 · ⭐ Delivery verify karo (order se pehle ZARURI)",
    method: "POST",
    path: "/carts/verify-delivery",
    auth: "customerToken",
    tag: TAG.CHANGED,
    body: { type: "json", value: { locationId: "{{locationId}}" } },
    desc: describe({
      tag: TAG.CHANGED,
      summary:
        "Check karta hai ki cart ka vendor is address pe deliver karta hai ya nahi, aur cart ko 'verified' mark karta hai.",
      auth: AUTH_CUSTOMER,
      when: [
        "Cart screen se checkout pe jaate waqt.",
        "Delivery address badalne ke **turant baad** (step 14).",
        "**`POST /orders/create` isse pehle chale to `409 CART_NOT_VERIFIED` milega.**",
      ],
      notes: [
        "**Change:** ab `locationId` bhejna prefer karo — server usi se zipcode nikal leta hai. `zipcode` tab kaam aata hai jab customer ne abhi tak address save hi nahi kiya (guest-ish flow).",
        "Dono me se **koi ek** zaroori hai, dono bhejo to `locationId` jeetega.",
        "Success pe cart pe `verifiedAt` set ho jata hai. Cart badalne pe (item add/remove/address change) ye reset ho jata hai — isliye dobara verify karna padta hai.",
      ],
      fields: [
        ["locationId", "ObjectId", "locationId ya zipcode", "`{{locationId}}` — recommended"],
        ["zipcode", "string", "locationId ya zipcode", "`577001` — 6 digit Indian PIN"],
      ],
      errors: [
        E.VENDOR_NOT_SERVICEABLE,
        E.PINCODE_NOT_SERVICEABLE,
        ["422", "—", "Na `locationId` diya na `zipcode`"],
      ],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.cart.clear",
    group: "05 Cart",
    name: "26 · Cart khaali karo",
    method: "DELETE",
    path: "/carts/clear",
    auth: "customerToken",
    tag: TAG.SAME,
    desc: describe({
      tag: TAG.SAME,
      summary: "Poora cart clear kar deta hai.",
      auth: AUTH_CUSTOMER,
      when: ["Cart screen ke 'Clear cart' pe.", "`409 CART_VENDOR_CONFLICT` ke manual fix ke taur pe."],
      notes: [
        "`?replaceCart=true` wala shortcut isse behtar hai — ek hi call me clear + add ho jata hai.",
      ],
      errors: [E.UNAUTH],
    }),
    script: expectStatus(200),
  },

  // ══════════════════════════════════════════════════════════════
  // 06 CHECKOUT & ORDERS
  // ══════════════════════════════════════════════════════════════
  {
    id: "cust.order.preview",
    group: "06 Checkout & Orders",
    name: "27 · 🆕 ⭐ Order preview (checkout screen ka data)",
    method: "POST",
    path: "/orders/preview",
    auth: "customerToken",
    tag: TAG.NEW,
    body: { type: "json", value: { locationId: "{{locationId}}" } },
    desc: describe({
      tag: TAG.NEW,
      summary:
        "Order banaye **bina** batata hai: subtotal, distance, delivery charge aur final payable amount.",
      auth: AUTH_CUSTOMER,
      when: [
        "Step 25 (verify) ke baad, step 28 (create) se **pehle**.",
        "Checkout screen kholte hi, aur address badalne pe dobara.",
      ],
      notes: [
        "**Ye endpoint pehle tha hi nahi — app ko delivery charge ka pata hi place-order ke baad chalta tha.**",
        "`POST /orders/create` bilkul yahi calculation use karta hai (shared helper), isliye preview aur final bill me **kabhi mismatch nahi** hoga.",
        "Delivery charge sirf tab lagta hai jab vendor ne apni setting me `isEnabled: true` kiya ho. Warna `deliveryCharge: 0` aata hai — aur ye by-default off hai.",
        "Charge ka formula: `baseCharge + (distanceKm × perKmRate) + (weightKg × perKgRate)`, phir vendor ke caps, phir platform ka hard cap **₹200**.",
        "`freeDeliveryAbove` cross kar gaya to charge 0 ho jata hai.",
      ],
      fields: [["locationId", "ObjectId", "yes", "Delivery address ka id"]],
      errors: [
        E.CART_NOT_VERIFIED,
        E.VENDOR_NOT_SERVICEABLE,
        E.OUT_OF_RADIUS,
        E.MIN_ORDER_NOT_MET,
        E.VENDOR_PICKUP_MISSING,
        ["400", "—", "Cart khaali hai"],
      ],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.order.create",
    group: "06 Checkout & Orders",
    name: "28 · Order place karo (COD)",
    method: "POST",
    path: "/orders/create",
    auth: "customerToken",
    tag: TAG.CHANGED,
    body: {
      type: "json",
      value: { locationId: "{{locationId}}", paymentMethod: "COD" },
    },
    desc: describe({
      tag: TAG.CHANGED,
      summary:
        "Cart ko order me convert karta hai, stock kam karta hai aur cart khaali kar deta hai.",
      auth: AUTH_CUSTOMER,
      when: ["Step 27 ke baad — 'Place Order' button."],
      notes: [
        "**Breaking:** `paymentMethod` me sirf `\"COD\"` chalega. `\"ONLINE\"` bhejne pe `422` — Razorpay abhi disabled hai aur `POST /orders/verify-payment` route **hata diya gaya** hai.",
        "Order `PENDING` status me banta hai. Aage vendor hi badhata hai.",
        "`orderNumber` format: `NVS-2609-000004` (`NVS-<pincode ke last 4>-<6 digit serial>`). Ye atomic counter se banta hai — duplicate kabhi nahi hoga.",
        "Poora operation ek **MongoDB transaction** me hota hai: stock kam, cart purchase-mark, order create — ya sab hoga ya kuch nahi.",
        "Har item me `productSnapshot { name, brand, SKU, image, weightInKg }` save hota hai, taaki product baad me badal jaye to bhi purana order waisa hi dikhe. **Order history me ye snapshot dikhao, live product data nahi.**",
        "**Removed:** `items[].vendorId`, `items[].locationId` aur `expectedDeliveryAt` fields hata di gayi hain.",
        "**Response ka shape dhyan se:** ye poora order document nahi deta — ek chhota confirmation object deta hai: `{ type, orderId, orderNumber, subTotal, deliveryCharge, payableAmount, status, message }`. Order ki full detail ke liye `GET /orders/get/{orderId}` call karo. **Id `data.orderId` me hai, `data._id` me nahi.**",
      ],
      fields: [
        ["locationId", "ObjectId", "yes", "Delivery address ka id"],
        ["paymentMethod", "enum", "yes", "Sirf `COD`"],
      ],
      enums: [
        ["paymentMethod", "`COD`", "`ONLINE` abhi band hai — bhejoge to 422"],
        [
          "status (response)",
          "`PENDING`",
          "Naya order hamesha PENDING me banta hai",
        ],
        [
          "paymentStatus (response)",
          "`NOT_REQUIRED`",
          "COD me payment collect delivery pe hoti hai",
        ],
      ],
      errors: [
        E.CART_NOT_VERIFIED,
        E.STOCK_UNAVAILABLE,
        E.VENDOR_NOT_SERVICEABLE,
        E.OUT_OF_RADIUS,
        E.MIN_ORDER_NOT_MET,
        E.VENDOR_PICKUP_MISSING,
        ["422", "—", "`paymentMethod` COD nahi hai"],
      ],
    }),
    script: [
      "const j = pm.response.json();",
      "const d = (j && j.data) || {};",
      "if (d.orderId) {",
      '    pm.environment.set("orderId", d.orderId);',
      '    pm.environment.set("orderNumber", d.orderNumber);',
      '    console.log("✅ orderId =", d.orderId, "·", d.orderNumber);',
      "}",
      "",
      'pm.test("201 Created", () => pm.response.to.have.status(201));',
      'pm.test("orderNumber mila", () => pm.expect(pm.response.json().data).to.have.property("orderNumber"));',
    ],
  },

  {
    id: "cust.order.getAll",
    group: "06 Checkout & Orders",
    name: "29 · Mere orders (order history)",
    method: "GET",
    path: "/orders/getAll",
    auth: "customerToken",
    tag: TAG.CHANGED,
    query: paging([
      { key: "status", value: "PENDING", description: "Status se filter", disabled: true },
      { key: "orderNumber", value: "NVS-2609-000004", description: "Order number se", disabled: true },
      { key: "fromDate", value: "2026-09-01", description: "ISO date", disabled: true },
      { key: "toDate", value: "2026-09-30", description: "ISO date", disabled: true },
    ]),
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Customer ke apne orders ki list.",
      auth: AUTH_CUSTOMER,
      when: ["'My Orders' screen.", "Order place karne ke baad confirmation screen se."],
      notes: [
        "Customer ko hamesha **sirf apne** orders milte hain — `?userId=` bhejne se kuch nahi badalta.",
        "Har item me `productSnapshot` hai — history me wahi dikhao.",
        "Status ke hisaab se UI: `PENDING` (vendor confirm kar raha hai), `ACCEPTED`, `PACKED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED` (customer ne kiya), `REJECTED` (vendor ne kiya).",
        "`CONFIRMED` ek **legacy** status hai — sirf migration se aaye purane orders me mil sakta hai, naya order kabhi CONFIRMED me nahi banta. App ise `ACCEPTED` jaisa hi dikhaye.",
      ],
      enums: [
        [
          "status",
          "`PENDING` · `ACCEPTED` · `PACKED` · `OUT_FOR_DELIVERY` · `DELIVERED` · `CANCELLED` · `REJECTED` · `CONFIRMED`(legacy) · `INITIATED`(internal)",
          "Order lifecycle",
        ],
        ["paymentStatus", "`NOT_REQUIRED` · `INITIATED` · `SUCCESS` · `FAILED`", "COD me `NOT_REQUIRED`"],
        ["paymentMethod", "`COD` · `ONLINE`", "`ONLINE` abhi band"],
      ],
      errors: [E.UNAUTH],
    }),
    script: saveFirstId("orderId", "data.data"),
  },

  {
    id: "cust.order.get",
    group: "06 Checkout & Orders",
    name: "30 · Order detail / tracking",
    method: "GET",
    path: "/orders/get/{{orderId}}",
    auth: "customerToken",
    tag: TAG.CHANGED,
    desc: describe({
      tag: TAG.CHANGED,
      summary: "Ek order ki poori detail — items, pricing, address, status history.",
      auth: AUTH_CUSTOMER,
      when: ["Order history se kisi order pe tap karne pe — tracking screen."],
      notes: [
        "Doosre customer ka order id daaloge to `404` — leak nahi hota.",
        "`statusHistory[]` me har transition ka `status`, `at`, `by`, `note` hota hai — isse tracking timeline banao.",
        "`deliveredAt` DELIVERED hone pe set hota hai.",
        "`assignedTo` / `assignedAt` fields reserve hain (delivery-boy feature future ke liye) — abhi hamesha `null` rahenge, inpe koi logic mat banao.",
      ],
      errors: [E.NOT_FOUND, E.UNAUTH],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.order.cancel",
    group: "06 Checkout & Orders",
    name: "31 · 🆕 Order cancel karo",
    method: "PUT",
    path: "/orders/{{orderId}}/cancel",
    auth: "customerToken",
    tag: TAG.NEW,
    body: { type: "json", value: { reason: "Galti se order ho gaya tha" } },
    desc: describe({
      tag: TAG.NEW,
      summary: "Customer khud apna order cancel karta hai. Stock apne aap wapas chala jata hai.",
      auth: AUTH_CUSTOMER,
      when: ["Order tracking screen ka 'Cancel Order' button."],
      notes: [
        "**Sirf `PENDING` aur `ACCEPTED` pe chalta hai.** `PACKED` ke baad cancel nahi hota — `409 INVALID_STATUS_TRANSITION`. App ko cancel button `PACKED` se aage chhupa dena chahiye.",
        "Cancel hote hi har item ka stock guarded `$inc` se wapas add ho jata hai.",
        "Vendor ko push notification chali jati hai.",
        "`reason` optional hai par UI me maangna behtar hai — vendor ko dikhta hai.",
      ],
      fields: [["reason", "string", "no", "`Galti se order ho gaya tha` — max 300 chars"]],
      errors: [E.INVALID_STATUS_TRANSITION, E.NOT_FOUND, E.FORBIDDEN],
      extra: [
        "**Customer ke allowed transitions:**",
        "",
        "| Abhi status | Customer ye kar sakta hai |",
        "|---|---|",
        "| `PENDING` | → `CANCELLED` |",
        "| `ACCEPTED` | → `CANCELLED` |",
        "| `PACKED` / `OUT_FOR_DELIVERY` / `DELIVERED` | ❌ kuch nahi |",
      ].join("\n"),
    }),
    script: expectStatus(200),
  },

  // ══════════════════════════════════════════════════════════════
  // 07 CONTENT
  // ══════════════════════════════════════════════════════════════
  {
    id: "cust.banner.getAll",
    group: "07 Content (read-only)",
    name: "32 · Banners",
    method: "GET",
    path: "/banners/getAll",
    auth: "customerToken",
    tag: TAG.SAME,
    query: paging([
      { key: "isActive", value: "true", description: "Sirf active banners", disabled: true },
    ]),
    desc: describe({
      tag: TAG.SAME,
      summary: "Home screen ke promotional banners.",
      auth: "Koi bhi logged-in user",
      when: ["Home screen ke saath."],
      notes: [
        "Banners **global** hain — vendor-scoped nahi. Admin hi banata hai.",
      ],
      errors: [E.UNAUTH],
    }),
    script: saveFirstId("bannerId", "data.data"),
  },

  {
    id: "cust.banner.get",
    group: "07 Content (read-only)",
    name: "33 · Ek banner",
    method: "GET",
    path: "/banners/get/{{bannerId}}",
    auth: "customerToken",
    tag: TAG.SAME,
    desc: describe({
      tag: TAG.SAME,
      summary: "Ek banner ki detail.",
      auth: "Koi bhi logged-in user",
      errors: [E.NOT_FOUND],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.terms.getAll",
    group: "07 Content (read-only)",
    name: "34 · Terms & Conditions",
    method: "GET",
    path: "/terms-and-conditions/getAll",
    auth: "customerToken",
    tag: TAG.SAME,
    query: paging(),
    desc: describe({
      tag: TAG.SAME,
      summary: "Terms & Conditions ki list.",
      auth: "Koi bhi logged-in user",
      when: ["Settings → Terms screen."],
      errors: [E.UNAUTH],
    }),
    script: saveFirstId("termId", "data.data"),
  },

  {
    id: "cust.terms.get",
    group: "07 Content (read-only)",
    name: "35 · Ek term",
    method: "GET",
    path: "/terms-and-conditions/get/{{termId}}",
    auth: "customerToken",
    tag: TAG.SAME,
    desc: describe({
      tag: TAG.SAME,
      summary: "Ek Terms & Conditions entry.",
      auth: "Koi bhi logged-in user",
      errors: [E.NOT_FOUND],
    }),
    script: expectStatus(200),
  },

  {
    id: "cust.privacy.getAll",
    group: "07 Content (read-only)",
    name: "36 · Privacy Policy",
    method: "GET",
    path: "/privacy-and-policies/getAll",
    auth: "customerToken",
    tag: TAG.SAME,
    query: paging(),
    desc: describe({
      tag: TAG.SAME,
      summary: "Privacy policy ki list.",
      auth: "Koi bhi logged-in user",
      when: ["Settings → Privacy Policy screen."],
      errors: [E.UNAUTH],
    }),
    script: saveFirstId("privacyId", "data.data"),
  },

  {
    id: "cust.privacy.get",
    group: "07 Content (read-only)",
    name: "37 · Ek privacy policy",
    method: "GET",
    path: "/privacy-and-policies/get/{{privacyId}}",
    auth: "customerToken",
    tag: TAG.SAME,
    desc: describe({
      tag: TAG.SAME,
      summary: "Ek privacy policy entry.",
      auth: "Koi bhi logged-in user",
      errors: [E.NOT_FOUND],
    }),
    script: expectStatus(200),
  },
];
