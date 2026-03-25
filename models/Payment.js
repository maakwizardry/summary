const mongoose = require("mongoose");
const paymentSchema = mongoose.Schema({
    variantId: {
        type: String,
        required: true
    },
    productId: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    }
})
const paymentModel = mongoose.model("Payment", paymentSchema);
module.exports = paymentModel