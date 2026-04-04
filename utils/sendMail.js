const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
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



const sendMail = async ({ to, subject, name = "User", otp }) => {

  const quote = "“Do not wait to strike till the iron is hot, but make it hot by striking.” — W.B. Yeats";

  const htmlContent = `
  <html>
    <body style="font-family: Arial; background:#f4f6f8; padding:20px;">
      <div style="max-width:600px;margin:auto;background:#fff;border-radius:8px;overflow:hidden;">
        
        <div style="background:black;padding:20px;text-align:center;">
          <h1 style="color:#fff;margin:0;">BriefMe</h1>
          <p style="color:#ccc;margin:5px 0;">AI Summarization</p>
        </div>

        <div style="padding:30px;color:#333;">
          <p>Dear <strong>${name}</strong>,</p>
          <p>Your OTP (valid for 10 minutes):</p>

          <div style="text-align:center;margin:20px 0;">
            <span style="background:#f0f4ff;padding:15px 25px;font-size:24px;letter-spacing:6px;color:#1d1dff;font-weight:bold;border-radius:6px;">
              ${otp}
            </span>
          </div>

          <p>If you didn’t request this, ignore this email.</p>

          <blockquote style="border-left:4px solid #6b5bff;padding:10px;background:#fafbff;">
            ${quote}
          </blockquote>
        </div>

        <div style="text-align:center;font-size:12px;color:#666;padding:15px;">
          © ${new Date().getFullYear()} BriefMe
        </div>
      </div>
    </body>
  </html>
  `;

  const mailOptions = {
    from: `"Summary AI" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    html: htmlContent,
    // text: `Your OTP is ${otp}`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}`);
    return otp;
  } catch (error) {
    console.error("❌ Email error:", error);
    return null;
  }
};

module.exports = sendMail;
