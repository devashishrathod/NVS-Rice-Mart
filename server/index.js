require("dotenv").config();
const express = require("express");
// ⛔ `cors` yahan JAAN-BOOJH KE nahi lagaya — neeche wala note padho.
// const cors = require("cors");
const morgan = require("morgan");
const ngrok = require("ngrok");
const fileUpload = require("express-fileupload");

const { mongoDb } = require("./database/mongoDb");
const { errorHandler } = require("./middlewares");
const { throwError } = require("./utils");
const allRoutes = require("./routes");

const app = express();
const port = process.env.PORT || 8000;

app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));
app.use(express.json());
// ⛔ CORS yahan se MAT lagao.
//
// Prod pe nginx pehle se CORS headers bhejta hai (`sites-available/nvsricemart`):
//   add_header Access-Control-Allow-Origin/Methods/Headers ... always;
//   if ($request_method = OPTIONS) { return 204; }   ← preflight bhi wahi handle karta hai
//
// Yahan `app.use(cors())` lagane pe har response me `Access-Control-Allow-Origin`
// DO BAAR jata hai (ek nginx se, ek yahan se). Browser multiple values dekh ke
// request reject kar deta hai — frontend pe "CORS error" aata hai, chahe API
// 200 hi kyun na de.
//
// 17 Sep 2026 ko prod pe exactly yahi hua tha. Agar kabhi CORS express se hi
// chalana ho, to pehle nginx ke `add_header` aur `OPTIONS → 204` wale block
// hatao — dono jagah ek saath kabhi nahi.
// app.use(cors());
app.use(morgan("dev"));
app.use("/nvs-rice-mart/", allRoutes);
app.get("/", async (req, res) => {
  res.send("Welcome to NVS Rice Mart🚀");
});
app.use((req, res, next) => {
  throwError(404, "Invalid API");
});
app.use(errorHandler);

mongoDb();

app.listen(port, async () => {
  console.log(`✅ NVS-Rice Mart Server running on http://localhost:${port}`);
  if (process.env.ENABLE_NGROK === "true") {
    const url = await ngrok.connect({
      addr: port,
      authtoken: process.env.NGROK_AUTH_TOKEN,
      // subdomain: process.env.NGROK_SUBDOMAIN // must be set for custom subdomain
    });
    console.log(`Public URL: ${url}`);
  }
});
