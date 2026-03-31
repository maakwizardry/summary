const paymentRouter = require('express').Router();
const authMiddleware = require("../middleware/userMiddleware");
const { getProducts, getVariants, subscribtion, getSubscriptions } = require('../controllers/PaymentController');
paymentRouter.get('/getProducts', getProducts);
paymentRouter.get('/getVariants', getVariants);
paymentRouter.post('/checkout', authMiddleware, subscribtion);
paymentRouter.get('/subscription', authMiddleware, getSubscriptions);
module.exports = paymentRouter;