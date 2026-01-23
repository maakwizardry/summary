const ContactModel = require('../models/Conact');
// controllers/contact.js
const contact = async (req, res) => {
    try {
        const { name, email, category, message } = req.body;

        if (!name || !email || !category || !message) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Save to DB
        const contact = new ContactModel({ name, email, category, message });
        await contact.save();

        res.status(201).json({ success: true, data: contact, message : "We received your request , we will connect with you , thanks for reaching out us" });
    } catch (error) {
        console.error("Contact save error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

module.exports = contact;
