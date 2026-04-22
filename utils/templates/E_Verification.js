const verifyEmailTemplate = ({ name = "User", url }) => {
  return {
    subject: "Verify your email address",
    html: `
    <div style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
      
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
        <tr>
          <td align="center">

            <!-- Card -->
            <table width="100%" cellpadding="0" cellspacing="0"
              style="max-width:600px;background:#ffffff;border-radius:12px;
                     border:1px solid #e5e7eb;">

              <tr>
                <td style="padding:24px;">

                  <!-- Logo Header -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding-bottom:20px;">
                        
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <!-- Logo -->
                            <td style="background:#15803d;
                                       width:40px;height:40px;
                                       border-radius:8px;
                                       color:#fff;
                                       text-align:center;
                                       font-size:18px;
                                       font-weight:bold;">
                              ✨
                            </td>

                            <td width="10"></td>

                            <!-- Brand -->
                            <td style="text-align:left;">
                              <div style="font-size:15px;font-weight:700;color:#111;">
                                Summary AI
                              </div>
                              <div style="font-size:11px;color:#777;">
                                Document Intelligence
                              </div>
                            </td>
                          </tr>
                        </table>

                      </td>
                    </tr>
                  </table>

                  <!-- Title -->
                  <div style="text-align:center;font-size:18px;font-weight:700;color:#111;margin-bottom:10px;">
                    Verify your email
                  </div>

                  <!-- Subtitle -->
                  <div style="text-align:center;font-size:14px;color:#666;line-height:1.5;margin-bottom:18px;">
                    Please confirm your email address to get started.
                  </div>

                  <!-- Greeting -->
                  <div style="font-size:14px;color:#333;margin-bottom:8px;">
                    Dear ${name},
                  </div>

                  <!-- Message -->
                  <div style="font-size:14px;color:#555;line-height:1.6;margin-bottom:20px;">
                    Click the button below to verify your email and activate your account.
                  </div>

                  <!-- CTA -->
                  <div style="text-align:center;margin-bottom:20px;">
                    <a href="${url}" 
                       style="background:#15803d;
                              color:#ffffff;
                              text-decoration:none;
                              padding:12px 20px;
                              border-radius:6px;
                              font-size:14px;
                              font-weight:600;
                              display:inline-block;">
                      Verify Email
                    </a>
                  </div>

                  <!-- Divider -->
                  <div style="height:1px;background:#eee;margin:14px 0;"></div>

                  <!-- Fallback -->
                  <div style="font-size:12px;color:#888;line-height:1.5;margin-bottom:6px;">
                    If the button doesn’t work, copy and paste this link:
                  </div>

                  <div style="font-size:12px;word-break:break-all;">
                    <a href="${url}" style="color:#15803d;">
                      ${url}
                    </a>
                  </div>

                  <!-- Footer -->
                  <div style="padding-top:16px;font-size:11px;color:#999;text-align:center;">
                    If you didn’t create an account, you can ignore this email.
                    <br/><br/>
                    © ${new Date().getFullYear()} SummaryAI
                  </div>

                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>

    </div>
    `
  };
};

module.exports = verifyEmailTemplate;