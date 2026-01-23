const paymentRouter = require('express').Router();
const authMiddleware = require("../middleware/userMiddleware");
const {getProducts, getVariants, subscribtion} = require('../controllers/PaymentController');
paymentRouter.get('/getProducts', getProducts);
paymentRouter.get('/getVariants', getVariants);
paymentRouter.post('/subscription', subscribtion);
module.exports = paymentRouter;