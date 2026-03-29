const User = require("../models/User");

const isPro = async (req, res, next) => {
    try {
        const userId = req.user.id; // comes from auth middleware

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // ✅ Check Pro
        if (!user.pro) {
            return res.status(403).json({
                message: "Upgrade to Pro to access this feature"
            });
        }

        next();

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = isPro;