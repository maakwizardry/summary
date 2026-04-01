const mongoose = require("mongoose");
const subscriptionSchema = mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    subscriptionId: {
        type: String,
        required: true
    },
    customerId: {
        type: String,
        required: true
    },
    orderId: {
        type: String,
        required: true
    },
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
    variantName: {
        type: String,
        required: true
    },

    // Lemon subscription ID
    status: {
        type: String,
        enum: ["active", "cancelled", "expired", "past_due", null],
        default: null
    },
    plan: {
        type: String,
        default: null
    },
    startDate: Date,
    currentPeriodEnd: Date,         // renews_at
    cancelled: {
        type: Boolean,
        default: false
    },
    test_mode: Boolean,
    customerPortalUrl: {
        type: String
    },
    updatePaymentUrl: {
        type: String
    }

},
    { timestamps: true }
)
const subscriptionModel = mongoose.model("Subscription", subscriptionSchema);
module.exports = subscriptionModel