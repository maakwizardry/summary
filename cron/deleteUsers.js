// src/cron/deleteUsers.js

const cron = require("node-cron");
const User = require("../models/User");

const deleteOldUnverifiedUsers = async () => {
    try {
        const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const result = await User.deleteMany({
            isVerified: false,
            createdAt: { $lt: cutoffTime }
        });

        console.log(`[CRON] Deleted ${result.deletedCount} unverified users`);
    } catch (err) {
        console.error("[CRON ERROR]", err.message);
    }
};

// run every hour
cron.schedule("0 * * * *", deleteOldUnverifiedUsers);

module.exports = deleteOldUnverifiedUsers;