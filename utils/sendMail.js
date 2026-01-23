const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config();

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// helper: generate OTP
function generateOTP(length = 6) {
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += Math.floor(Math.random() * 10);
    }
    return otp;
}

const sendMail = async ({ to, subject, otp,  name = "User" }) => {
    const quote = "“Do not wait to strike till the iron is hot, but make it hot by striking.” — W.B. Yeats";

    const html = `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#f4f6f8;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,sans-serif;">
                
                <!-- Header with Logo -->
                <tr>
                  <td align="center" bgcolor="black" style="padding:20px;">
                    <img src="cid:briefme-logo" alt="BriefMe Logo" width="60" style="display:block;margin:0 auto;" />
                    <h1 style="color:#fff;font-size:22px;margin:10px 0 2px;">BriefMe</h1>
                    <div style="color:#ccc;font-size:12px;">AI Summarization</div>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:30px;color:#333;font-size:15px;line-height:1.6;">
                    <p>Hi <strong>user, mohammed azhan from brief me</strong>,</p>
                    <p>Here is your One-Time Password (OTP). It will expire in <strong>10 minutes</strong>:</p>
                    <table align="center" cellpadding="0" cellspacing="0" style="margin:20px auto;">
                      <tr>
                        <td align="center" bgcolor="#f0f4ff" style="padding:15px 30px;border-radius:6px;font-size:24px;letter-spacing:6px;color:#1d1dff;font-weight:bold;">
                          ${otp}
                        </td>
                      </tr>
                    </table>
                    <p>If you didn’t request this code, you can safely ignore this message.</p>

                    <!-- Quote -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                      <tr>
                        <td style="border-left:4px solid #6b5bff;padding:12px 16px;background:#fafbff;font-style:italic;color:#444;">
                          ${quote}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td align="center" bgcolor="#f9f9f9" style="padding:15px;font-size:12px;color:#666;">
                    &copy; ${new Date().getFullYear()} Brief Me • All rights reserved
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    `;

    const mails = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        text: `Your OTP is: ${otp}\n\nQuote: ${quote}`, // plain text fallback
        html,
        attachments: [
            {
                filename: 'image.png',
                path: path.join(__dirname, 'image.png'), // same folder as this file
                cid: 'briefme-logo' // must match the cid used in <img src="cid:briefme-logo">
            }
        ]
    };

    try {
        await transporter.sendMail(mails);
        console.log(`✅ Email sent to ${to} with OTP: ${otp}`);
        return otp; // return OTP so you can store/verify it
    }
    catch (e) {
        console.error("❌ Email error:", e);
        return null;
    }
};

module.exports = sendMail;
