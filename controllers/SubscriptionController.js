const Subscription = require("../models/Subscription");
const User = require("../models/User");

const getSubscriptions = async (req, res) => {
    const userId = req.user._id;
    try {
        const subscription = await Subscription.find({ userId: userId }).select("plan status startDate currentPeriodEnd variantName customerPortalUrl").sort({ createdAt: -1 });
        if (!subscription) {
            return res.status(404).json({ message: "No subscription found" });
        }
        return res.status(200).json({ subscription });
    }
    catch (e) {
        console.log(e);
        return res.status(500).json({ message: "Something went wrong" });
    }
}

module.exports = { getSubscriptions };