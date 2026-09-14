const { sendNotification, sendNotificationToMany } = require("./sendNotification");
const {
  notifyOrderPlaced,
  notifyOrderStatusChanged,
} = require("./orderNotifications");

module.exports = {
  sendNotification,
  sendNotificationToMany,
  notifyOrderPlaced,
  notifyOrderStatusChanged,
  // @deprecated — purana helper `userId` ignore karke hamesha admin ko
  // bhejta tha aur token na hone par throw kar deta tha. Naya code
  // `sendNotification({ toUserId, ... })` use kare.
  sendSingleNotification: async (userId, title, description, type, data) =>
    sendNotification({ toUserId: userId, title, body: description, type, data }),
};
