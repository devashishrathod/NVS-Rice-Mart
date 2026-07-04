const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const User = require("../../models/User");
const serviceAccount = require("../../firebaseServiceKeys.json");
const { ROLES } = require("../../constants");
const { throwError } = require("../../utils");

// let serviceAccount;

// // Render Secret File Path
// const renderSecretPath = "/etc/secrets/firebaseServiceKeys.json";

// if (fs.existsSync(renderSecretPath)) {
//   console.log("✅ Using Firebase Secret File from Render");
//   serviceAccount = require(renderSecretPath);
// } else {
//   console.log("✅ Using Local Firebase Service Account");
//   serviceAccount = require(
//     path.join(__dirname, "../../firebaseServiceKeys.json"),
//   );
// }

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

exports.sendSingleNotification = async (
  userId,
  title,
  description,
  type = "order",
  orderData = {},
) => {
  const nvsAdmin = await User.findOne({ role: ROLES.ADMIN });
  console.log(nvsAdmin, "nvsAdmin");
  if (!nvsAdmin) throwError(404, "Admin not found");
  if (!nvsAdmin.fcmToken) throwError(400, "Admin FCM token not found");
  // const user = await User.findById(userId);
  const message = {
    token: nvsAdmin.fcmToken,
    notification: {
      title: title,
      body: description,
    },
    data: {
      ...orderData,
      type: type,
    },
  };
  const data = await admin.messaging().send(message);
  console.log(data, `notificaton sent to ${admin?.name}`);
  // await Notification.create({
  //   userId,
  //   title: name,
  //   message: description,
  //   adminId: admin._id,
  //   type,
  // });
};
