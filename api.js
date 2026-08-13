const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE = process.env.MPESA_SHORTCODE;
const PASSKEY = process.env.MPESA_PASSKEY;
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL;

function getTimestamp() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);

  const values = {};
  parts.forEach(part => {
    if (part.type !== "literal") values[part.type] = part.value;
  });

  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

function normalizePhone(phone) {
  phone = String(phone).replace(/\D/g, "");

  if (phone.startsWith("07") || phone.startsWith("01")) {
    return "254" + phone.substring(1);
  }

  if (phone.startsWith("254")) return phone;

  return null;
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Fextoo M-PESA server is running 💘"
  });
});

app.post("/api/pay", async (req, res) => {
  try {
    const { phone, name } = req.body;
    const phoneNumber = normalizePhone(phone);

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Kenyan phone number."
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required."
      });
    }

    if (!CONSUMER_KEY || !CONSUMER_SECRET || !SHORTCODE || !PASSKEY || !CALLBACK_URL) {
      return res.status(500).json({
        success: false,
        message: "M-PESA configuration is incomplete."
      });
    }

    const credentials = Buffer
      .from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`)
      .toString("base64");

    const tokenResponse = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${credentials}`
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;
    const timestamp = getTimestamp();

    const password = Buffer
      .from(`${SHORTCODE}${PASSKEY}${timestamp}`)
      .toString("base64");

    const stkResponse = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: 350,
        PartyA: phoneNumber,
        PartyB: SHORTCODE,
        PhoneNumber: phoneNumber,
        CallBackURL: CALLBACK_URL,
        AccountReference: "Fextoo",
        TransactionDesc: "Fextoo registration"
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.json({
      success: true,
      message: "M-PESA payment request sent.",
      checkoutRequestID: stkResponse.data.CheckoutRequestID,
      merchantRequestID: stkResponse.data.MerchantRequestID
    });

  } catch (error) {
    console.error(error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to start M-PESA payment."
    });
  }
});

app.post("/api/callback", (req, res) => {
  console.log("M-PESA CALLBACK:", JSON.stringify(req.body, null, 2));

  res.json({
    ResultCode: 0,
    ResultDesc: "Accepted"
  });
});

module.exports = app;
