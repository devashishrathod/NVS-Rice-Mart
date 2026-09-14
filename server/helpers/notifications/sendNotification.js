const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const User = require("../../models/User");

let initialised = false;

const initFirebase = () => {
  if (initialised || admin.apps.length) {
    initialised = true;
    return true;
  }
  try {
    const renderSecretPath = "/etc/secrets/firebaseServiceKeys.json";
    const localPath = path.join(__dirname, "../../firebaseServiceKeys.json");
    const keyPath = fs.existsSync(renderSecretPath)
      ? renderSecretPath
      : localPath;
    if (!fs.existsSync(keyPath)) {
      console.warn("⚠️  Firebase service key not found — push disabled");
      return false;
    }
    admin.initializeApp({
      credential: admin.credential.cert(require(keyPath)),
    });
    initialised = true;
    return true;
  } catch (e) {
    console.error("⚠️  Firebase init failed — push disabled:", e?.message);
    return false;
  }
};

/**
 * Ek user ko push bhejta hai.
 *
 * ⚠️ KABHI throw nahi karta. Pehle wala helper token na hone par throw kar
 *    deta tha, jo business transaction ke baad chalta tha — matlab order
 *    ban jane ke baad bhi API error de deti thi.
 *
 * @returns {Promise<boolean>} bheja gaya ya nahi
 */
/**
 * Stage/rehearsal DB me ASLI customers ke FCM tokens hote hain. Wahan
 * `DISABLE_PUSH=true` set karo — koi push bahar nahi jayegi, sirf log hogi.
 * DB bilkul untouched rehta hai.
 */
const pushDisabled = () =>
  String(process.env.DISABLE_PUSH).toLowerCase() === "true";

const sendNotification = async ({ toUserId, title, body, type = "order", data = {} }) => {
  try {
    if (!toUserId) return false;
    if (pushDisabled()) {
      console.log(`🔕 [DISABLE_PUSH] skip → ${toUserId}: ${title} — ${body}`);
      return false;
    }
    if (!initFirebase()) return false;

    const user = await User.findById(toUserId).select("fcmToken name").lean();
    if (!user?.fcmToken) {
      // Token na hona normal hai (user ne app kabhi nahi khola) — chup-chaap skip
      return false;
    }

    await admin.messaging().send({
      token: user.fcmToken,
      notification: { title, body },
      data: {
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v ?? "")]),
        ),
        type: String(type),
      },
    });
    return true;
  } catch (e) {
    console.error(`Push to ${toUserId} failed:`, e?.message);
    return false;
  }
};

/** Bulk — har recipient independent hai, ek fail hone se baaki na ruke. */
const sendNotificationToMany = async ({ toUserIds = [], ...rest }) => {
  const results = await Promise.allSettled(
    toUserIds.filter(Boolean).map((toUserId) => sendNotification({ toUserId, ...rest })),
  );
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
};

module.exports = { sendNotification, sendNotificationToMany };
