const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const verifyEmailTemplate = require('./templates/E_Verification');
const welcomeTemplate = require('./templates/welcome');
const forgotPasswordTemplate = require('./templates/resetPassword');
// const path = require('path');
// const SibApiV3Sdk = require('sib-api-v3-sdk');
dotenv.config();

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_KEY,
  },
});



const sendMail = async ({ to, name = "User", type, url }) => {
  if (!to || !name || !type) {
    return false;
  }
  let data;

  if (type === "verify") {
    data = verifyEmailTemplate({ name, url });
  }
  else if (type === "welcome") {
    data = welcomeTemplate({ name, url });
  }
  else if (type === "forgot-password") {
    data = forgotPasswordTemplate({ name, url });
  }

  if (!data) {
    throw new Error(`Invalid email type: ${type}`);
  }


  const mailOptions = {
    from: `"Summary AI" <${process.env.EMAIL_FROM}>`,
    to,
    subject: data.subject,
    html: data.html,
    // text: `Your OTP is ${otp}`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error("❌ Email error:", error);
    return false;
  }
};

module.exports = sendMail;
