const mongoose = require("mongoose");
const { isValidZipCode } = require("../validator/common");
const { LOCATION_TYPES, DEFAULT_COUNTRY } = require("../constants");
const { userField } = require("./validObjectId");

const locationSchema = new mongoose.Schema(
  {
    userId: userField,
    // CUSTOMER = customer ka delivery address
    // VENDOR_BRANCH = vendor ki shop/branch (isDefault wala = pickup point)
    // `required` nahi rakha kyunki purane 143 docs me ye field nahi hai —
    // migration unhe backfill karega.
    type: {
      type: String,
      enum: [...Object.values(LOCATION_TYPES)],
      default: LOCATION_TYPES.CUSTOMER,
    },
    name: { type: String },
    shopOrBuildingNumber: { type: String },
    address: { type: String },
    area: { type: String },
    city: { type: String },
    district: { type: String },
    state: { type: String },
    // `default` yahan isliye ki `zipcode` ka validator country pe depend
    // karta hai — country na ho to `isValidZipCode()` hamesha `false` deta
    // hai aur SAHI zipcode bhi reject ho jata. Services pehle se "india"
    // set karti thi; ab model bhi khud safe hai.
    // (`VendorServiceArea.country` pe ye default pehle se tha.)
    country: { type: String, default: DEFAULT_COUNTRY },
    formattedAddress: { type: String },
    zipcode: {
      type: String,
      validate: {
        validator: function (v) {
          return isValidZipCode(this.country, v);
        },
        // ⚠️ Pehle yahan `props.instance.country` tha — Mongoose message
        // callback ko `instance` deta hi nahi (undefined hai). Nateeja: har
        // invalid zipcode pe asli error ki jagah
        // "TypeError: Cannot read properties of undefined" aata tha.
        message: (props) =>
          `${props.value} is not a valid ZIP/postal code for this country`,
      },
    },
    coordinates: { type: [Number], default: [0, 0] }, // [lat , lng]

    // NOTE: `geo` (GeoJSON) field hata diya gaya — koi writer tha, na reader,
    // na index. "Nearest branch" feature banate waqt tab add karna jab
    // usko actually likha jaye.
    // NOTE: `isProductAddress` / `isVendorAddress` bhi hata diye — `type`
    // aur `VendorServiceArea` ne unhe replace kar diya. Migration purane
    // docs se inhe $unset karti hai.

    // CUSTOMER      → customer ka default delivery address
    // VENDOR_BRANCH → pickup point (delivery distance isi se)
    // Invariant: ek userId ke andar ek hi isDefault:true
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

// ⛔ Purana index `{ location: "2dsphere" }` hata diya — schema me `location`
// naam ka koi field hai hi nahi (coordinates hai), isliye wo index kabhi
// kisi query me use nahi hota tha. Prod se drop karna hai:
//    db.locations.dropIndex("location_2dsphere")

locationSchema.index({ userId: 1, type: 1, isDeleted: 1, isDefault: 1 });
locationSchema.index({ userId: 1, isDeleted: 1, isDefault: 1 });
locationSchema.index({ zipcode: 1, isDeleted: 1 });

module.exports = mongoose.model("Location", locationSchema);
