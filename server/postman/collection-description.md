# NVS Rice Mart — Vendor Platform API

Single-shop se **vendor-based multi-tenant** platform me shift ke baad ki poori API.
Teen folder hain, teeno **call sequence me** lage hue hain:

| Folder | Kiske liye | Sequence |
|---|---|---|
| **Customer** | Mobile app dev | login → address → catalog → cart → verify → preview → order → tracking → cancel |
| **Vendor** | Vendor panel dev | login → profile/delivery → catalog CRUD → order queue → status transitions |
| **Admin** | Admin panel dev | login → vendor create → branch → pincode lookup → service area → monitoring |

---

## Shuru kaise karein

1. Environment **"NVS Rice Mart"** select karo (upar right corner).
2. Env me `target` set karo — `local`, `stage` ya `prod`. Har request se pehle `baseUrl` apne aap us hisaab se set ho jata hai.
3. Apne folder ka **pehla login request** chalao — token apne aap `{{customerToken}}` / `{{vendorToken}}` / `{{adminToken}}` me save ho jata hai. Aage har request usi ko use karti hai, manually paste karne ki zaroorat nahi.
4. Baaki requests **upar se neeche** chalate jao — har request apne baad wali ke liye id (`{{categoryId}}`, `{{productId}}`, `{{orderId}}`…) env me save karti jaati hai.

## Stage ke test accounts

| Role | Login | Password | Kya expect karein |
|---|---|---|---|
| admin | `ricemartnvs@gmail.com` | `Admin@123` | platform summary, 1 vendor |
| vendor | `nagraj@gmail.com` | `nagraj@123` | apna order queue + 30 products |
| customer (in-area) | `9886061450` | `Stage@123` | pincode 577001 → catalog `200` |
| customer (out-of-area) | `9620508145` | `Stage@123` | pincode 500774 → `404 PINCODE_NOT_SERVICEABLE` |
| customer (no address) | `8660222341` | `Stage@123` | koi address nahi → `400 PINCODE_REQUIRED` |

---

## Response ka shape

Har response ek hi envelope me aata hai:

```jsonc
// success
{ "success": true,  "message": "…", "data": { … } }

// error
{ "success": false, "message": "…", "error": { … }, "code": "PINCODE_REQUIRED" }
```

**Client hamesha `code` pe branch kare, `message` pe nahi** — `message` badal sakta hai, `code` fixed hai.

## Poore platform ke error codes

| HTTP | `code` | Matlab |
|---|---|---|
| 400 | `PINCODE_REQUIRED` | Customer ka default address nahi, query me bhi pincode nahi |
| 404 | `PINCODE_NOT_SERVICEABLE` | Is pincode pe koi vendor nahi |
| 409 | `PINCODE_ALREADY_ASSIGNED` | Pincode pehle se doosre vendor ka hai |
| 404 | `PRODUCT_NOT_AVAILABLE_HERE` | Product doosre vendor ka hai |
| 409 | `CART_VENDOR_CONFLICT` | Cart me doosre vendor ka item |
| 409 | `VENDOR_NOT_SERVICEABLE` | Cart ka vendor is address pe deliver nahi karta |
| 503 | `VENDOR_PICKUP_MISSING` | Vendor ka default branch missing (data issue) |
| 409 | `STOCK_UNAVAILABLE` | Order ke waqt stock kam nikla |
| 400 | `OUT_OF_RADIUS` | Address vendor ke `maxRadiusKm` se bahar |
| 400 | `MIN_ORDER_NOT_MET` | Subtotal `minOrderAmount` se kam |
| 409 | `INVALID_STATUS_TRANSITION` | Is role ko ye status change allowed nahi |
| 409 | `CART_NOT_VERIFIED` | Order se pehle `verify-delivery` nahi chalayi |
| 403 | `FORBIDDEN` | Ye resource aapka nahi |

## Saare enums ek jagah

| Enum | Values |
|---|---|
| `role` | `user` · `vendor` · `admin` · `staff` |
| `ORDER_STATUS` | `PENDING` · `ACCEPTED` · `PACKED` · `OUT_FOR_DELIVERY` · `DELIVERED` · `CANCELLED` · `REJECTED` · `CONFIRMED`(legacy) · `INITIATED`(internal) |
| `PAYMENT_METHODS` | `COD` (`ONLINE` abhi disabled) |
| `PAYMENT_STATUS` | `NOT_REQUIRED` · `INITIATED` · `SUCCESS` · `FAILED` |
| `VENDOR_STATUS` | `APPROVED` · `SUSPENDED` |
| `LOCATION_TYPES` | `CUSTOMER` · `VENDOR_BRANCH` |
| `PRODUCT_TYPES` | `grocery` · `electronics` · `clothing` |
| `LOGIN_TYPES` | `email` · `mobile` · `google` · `password` · `other` |
| `SUBSCRIPTION_TYPES` | `weekly` · `monthly` · `quarterly` · `half_yearly` · `yearly` |

## Order status machine

| Abhi | Vendor | Customer | Admin |
|---|---|---|---|
| `PENDING` | `ACCEPTED`, `REJECTED` | `CANCELLED` | — |
| `ACCEPTED` | `PACKED`, `REJECTED` | `CANCELLED` | — |
| `PACKED` | `OUT_FOR_DELIVERY` | — | — |
| `OUT_FOR_DELIVERY` | `DELIVERED` | — | — |
| `DELIVERED` / `CANCELLED` / `REJECTED` | — | — | — |

**Admin ka column jaan-boojh ke khaali hai** — admin sirf dekh sakta hai, order aage nahi badha sakta.

---

## Hataye gaye endpoints (ab 404 "Invalid API" denge)

| Endpoint | Kyun |
|---|---|
| `POST /orders/verify-payment` | Razorpay disabled, COD only |
| `PUT /orders/update/:id` | Admin ab status nahi badal sakta — vendor ka `PUT /orders/:id/status` use karo |
| `PUT /products/update-product-locations/:productId` | `ProductLocation` model hi delete ho gaya |
| `DELETE /products/remove-product-locations/:productId` | wahi |
| `POST /products/check-delivery/:productId` | `GET /service-areas/check?zipcode=` use karo |

## Saved examples ke baare me

Har request ka **200/201 example save hai** aur wo **StageDB pe asli call maar ke** record kiya gaya hai —
haath se nahi likha. Sirf 4 OTP endpoints ke examples documented hain (unhe chalane pe asli SMS/email
chala jata hai), aur un requests ki description me wo saaf likha hai.
