const nodemailer = require('nodemailer');

const contact = async (req, res) => {
    try {
        const { name, email, category, message } = req.body;

        if (!name || !email || !category || !message) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Send email via SMTP instead of saving to DB
        const transporter = nodemailer.createTransport({
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.BREVO_SMTP_USER,
                pass: process.env.BREVO_SMTP_KEY,
            },
        });

        await transporter.sendMail({
            from: `"Summary AI Contact" <${process.env.EMAIL_FROM}>`,
            to: 'hey@getsummaryapp.com',
            subject: `New Contact Submission: ${category}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #0f766e; margin: 0; font-size: 24px;">Summary AI Contact</h2>
                        <p style="color: #64748b; font-size: 14px; margin-top: 5px;">New message submission</p>
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #cbd5e1; margin-bottom: 25px;" />
                    
                    <div style="background-color: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <p style="margin: 0 0 12px 0; font-size: 15px;"><strong style="color: #475569;">Name:</strong> <span style="color: #0f172a;">${name}</span></p>
                        <p style="margin: 0 0 12px 0; font-size: 15px;"><strong style="color: #475569;">Email:</strong> <a href="mailto:${email}" style="color: #0f766e; text-decoration: none;">${email}</a></p>
                        <p style="margin: 0 0 12px 0; font-size: 15px;"><strong style="color: #475569;">Category:</strong> <span style="background-color: #f1f5f9; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 500;">${category}</span></p>
                        
                        <hr style="border: none; border-top: 1px dashed #cbd5e1; margin: 20px 0;" />
                        
                        <h4 style="color: #475569; margin: 0 0 12px 0; font-size: 15px;">Message:</h4>
                        <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; color: #334155; line-height: 1.6; font-size: 14px; white-space: pre-wrap; border: 1px solid #f1f5f9;">${message}</div>
                    </div>
                    
                    <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 25px;">
                        This is an automated message from your Summary AI platform.
                    </p>
                </div>
            `
        });

        res.status(200).json({ success: true, message: "We received your request, we will connect with you, thanks for reaching out to us" });
    } catch (error) {
        console.error("Contact email error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

module.exports = contact;
