const welcomeTemplate = ({ name = "User", url }) => {
  return {
    subject: "Welcome to SummaryAI 🚀",
    html: `
    <div style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
      
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
        <tr>
          <td align="center">

            <!-- Card -->
            <table width="100%" cellpadding="0" cellspacing="0"
              style="max-width:600px;background:#ffffff;border-radius:12px;
                     border:1px solid #e5e7eb;">

              <!-- ✅ ONE WRAPPER TD -->
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

                            <!-- Space -->
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
                  <table width="100%">
                    <tr>
                      <td align="center" style="font-size:18px;font-weight:700;color:#111;padding-bottom:10px;">
                        Welcome to SummaryAI 🚀
                      </td>
                    </tr>
                  </table>

                  <!-- Greeting -->
                  <table width="100%">
                    <tr>
                      <td style="font-size:14px;color:#333;padding-bottom:10px;">
                        Hey ${name},
                      </td>
                    </tr>
                  </table>

                  <!-- Intro -->
                  <table width="100%">
                    <tr>
                      <td style="font-size:14px;color:#555;line-height:1.6;padding-bottom:18px;">
                        We're glad you're here.<br/><br/>
                        SummaryAI helps you understand documents faster and more efficiently.
                      </td>
                    </tr>
                  </table>

                  <!-- Steps -->
                  <table width="100%">
                    <tr>
                      <td style="font-size:14px;color:#333;line-height:1.8;padding-bottom:22px;">
                        <strong>Get started in seconds:</strong><br/><br/>
                        • Upload your document<br/>
                        • Get a clear summary<br/>
                        • Ask questions and explore
                      </td>
                    </tr>
                  </table>

                  <!-- CTA -->
                  <table width="100%">
                    <tr>
                      <td align="center" style="padding-bottom:22px;">
                        <a href="${url}" 
                           style="background:#15803d;
                                  color:#ffffff;
                                  text-decoration:none;
                                  padding:12px 22px;
                                  border-radius:6px;
                                  font-size:14px;
                                  font-weight:600;
                                  display:inline-block;">
                          Upload your first document
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Tip -->
                  <table width="100%">
                    <tr>
                      <td style="font-size:12px;color:#666;line-height:1.5;padding-bottom:16px;">
                        <strong>Tip:</strong> Try asking —  
                        <i>"What are the key takeaways?"</i>
                      </td>
                    </tr>
                  </table>

                  <!-- Footer -->
                  <table width="100%">
                    <tr>
                      <td style="font-size:13px;color:#444;padding-top:10px;">
                        Welcome aboard 🚀<br/>
                        <strong>SummaryAI Team</strong>
                      </td>
                    </tr>
                  </table>

                  <!-- Divider -->
                  <table width="100%">
                    <tr>
                      <td style="border-top:1px solid #eee;padding-top:14px;"></td>
                    </tr>
                  </table>

                  <!-- Bottom -->
                  <table width="100%">
                    <tr>
                      <td style="padding-top:14px;font-size:11px;color:#999;text-align:center;">
                        © ${new Date().getFullYear()} SummaryAI
                      </td>
                    </tr>
                  </table>

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

module.exports = welcomeTemplate;