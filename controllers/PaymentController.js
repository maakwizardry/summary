
const { default: axios } = require('axios');
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const jwt = require('jsonwebtoken');
require('dotenv').config();

const lsqyConfig = {
    API_KEY: process.env.LEMONSQUEEZY_API_KEY,
    URL: "https://api.lemonsqueezy.com/v1",
    store_id: "221566",

}

const headers = {
    Accept: 'application/vnd.api+json',
    "Content-Type": 'application/vnd.api+json',
    Authorization: `Bearer ${lsqyConfig.API_KEY}`,
}



const getProducts = async (req, res) => {
    console.log("hit");
    try {
        const response = await axios.get(`${lsqyConfig.URL}/products`, {
            headers: headers,
        })
        const price = response.data.data[0].attributes.price_formatted;
        const buy_now_url = response.data.data[0].attributes.buy_now_url;
        res.json({ price, buy_now_url })
    }
    catch (error) {
        console.log(error);
        res.json({ status: false, });
    }

}

const getVariants = async (req, res) => {

    try {
        const vId = req.query.vId
        const response = await axios.get(`${lsqyConfig.URL}/variants`, {
            timeout: 5000,
            headers: headers,
        })
        res.status(200).json({ type: "Variants", variants: response.data, status: true });
    }
    catch (error) {
        console.log(error);
        res.json({ type: "Variants fetch failed", status: false, });
    }
}


const subscribtion = async (req, res) => {
    try {
        const user = req.user;
        const { variantId, email, id } = req.body;
        const planExists = await Subscription.findOne(
            { userId: user._id, status: "active" },
        );

        if (planExists) {
            return res.status(400).json({
                success: false,
                message: `There is already an active plan exists, please cancel exisisting plan before purchasing of new one.`,
                code: "ACTIVE_PLAN_EXISTS"
            });
        }



        const response = await axios.post(
            "https://api.lemonsqueezy.com/v1/checkouts",
            {
                data: {
                    type: "checkouts",
                    attributes: {
                        checkout_data: {
                            email: user.email,
                            custom: {
                                user_id: user._id,
                            }
                        },
                        product_options: {
                            redirect_url: `http://localhost:5173/billing`,
                            receipt_button_text: "Go to Dashboard"
                        }
                    },
                    relationships: {
                        store: {
                            data: {
                                type: "stores",
                                id: lsqyConfig.store_id
                            }
                        },
                        variant: {
                            data: {
                                type: "variants",
                                id: String(variantId)
                            }
                        }
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
                    "Content-Type": "application/vnd.api+json",
                    Accept: "application/vnd.api+json"
                }
            }
        );

        const checkoutUrl = response.data.data.attributes.url;
        res.json({ url: checkoutUrl, status: true });

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: "Checkout creation failed" });
    }
};

const getSubscriptions = async (req, res) => {
    try {
        const userId = req.user._id; // from auth middleware

        const subscriptions = await Subscription.find({ userId })
            .sort({ createdAt: -1 }); // latest first

        res.json({
            success: true,
            data: subscriptions
        });

    } catch (err) {
        console.error("❌ Error fetching subscriptions:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch subscriptions"
        });
    }
}


module.exports = { getProducts, getVariants, subscribtion, getSubscriptions };