const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { ROLES, LOGIN_TYPES } = require("../constants");
const { isValidPhoneNumber } = require("../validator/common");
const { locationField } = require("./validObjectId");

const userSchema = new mongoose.Schema(
  {
    // Customer ka default delivery address (Location.isDefault ke saath sync)
    locationId: locationField,
    name: { type: String },
    // NOTE: `address` field hata diya — koi writer nahi tha
    // (`updateUserById` me comment out) aur prod ke 1457 me se 0 docs me hai.
    // Address `Location` collection me hai.
    dob: { type: Date },
    role: {
      type: String,
      enum: [...Object.values(ROLES)],
      default: ROLES.USER,
    },
    loginType: {
      type: String,
      enum: [...Object.values(LOGIN_TYPES)],
      default: LOGIN_TYPES.PASSWORD,
    },
    // `select: false` — password hash kabhi query me by-default na aaye.
    // Jise chahiye (sirf login) wo `.select("+password")` maangta hai.
    password: { type: String, required: true, select: false },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      validate: {
        validator: validator.isEmail,
        message: (props) => `${props.value} is not a valid email address`,
      },
    },
    mobile: {
      type: String,
      validate: {
        validator: isValidPhoneNumber,
        message: (props) => `${props.value} is not a valid mobile number`,
      },
    },
    // referCode: { type: String, unique: true },
    // appliedReferalCode: { type: String },
    lastActivity: { type: Date, default: Date.now },
    // lastLocation: { lat: Number, lng: Number },
    // currentLocation: { lat: Number, lng: Number },
    fcmToken: { type: String },
    image: { type: String },
    otp: { code: String, expiresAt: Date },
    // uniqueId: { type: String, unique: true },
    currentScreen: { type: String, default: "LANDING_SCREEN" },
    isEmailVerified: { type: Boolean, default: false },
    isMobileVerified: { type: Boolean, default: false },
    isSignUpCompleted: { type: Boolean, default: false },
    isOnBoardingCompleted: { type: Boolean, default: false },
    isLoggedIn: { type: Boolean, default: false },
    isOnline: { type: Boolean },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

userSchema.methods.getSignedJwtToken = function (options = {}) {
  const expiresIn = options.expiresIn || "30d";
  const secret = options.secret || process.env.JWT_SECRET;
  return jwt.sign(
    { id: this._id, role: this.role, name: this.name, email: this.email },
    secret,
    { expiresIn },
  );
};

// userSchema.pre("save", function (next) {
//   if (this.isNew) {
//     this.uniqId = generateUniqId();
//   }
//   next();
// });

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.index({ role: 1, isDeleted: 1 });
// NOTE: `{ email, role }` aur `{ mobile, role }` ke partial-unique indexes
// Phase 1 me banenge — pehle migration duplicate mobile (8088684570) clean
// karega, warna index build fail hoga. Role ko key me isliye rakha hai kyunki
// auth flows pehle se `{ mobile, role }` / `{ email, role }` se hi lookup
// karte hain (ek hi mobile customer + vendor dono ka ho sakta hai).

module.exports = mongoose.model("User", userSchema);
