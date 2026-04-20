const subscriptionRoute = require('express').Router();
const authMiddleware = require("../middleware/userMiddleware");
const { getSubscriptions } = require("../controllers/SubscriptionController");
subscriptionRoute.get('/getSubscription', authMiddleware, getSubscriptions);
module.exports = subscriptionRoute;