
const { default: axios } = require('axios');
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
        const response = await axios.get(`${lsqyConfig.URL}/variants`, {
            timeout: 5000,
            headers: headers,
        })


        const { id } = response.data.data[0];
        res.status(200).json({ type: "Variants", id, status: true });
    }
    catch (error) {
        console.log(error);
        res.json({ type: "Variants fetch failed", status: false, });
    }
}

const subscribtion = async (req, res) => {
    const { variantId } = req.body || null;
    const { user_id } = req.body;
    const jwt_decode = jwt.decode(user_id);
    try {

        const response = await axios.post(`${lsqyConfig.URL}/checkouts`, {
            data: {
                type: "checkouts",
                attributes: {
                    checkout_data: {
                        custom: {
                            user_id: jwt_decode.id.toString()
                        }
                    },
                    product_options: {
                        redirect_url: "https://briefme.vercel.app",
                        receipt_button_text: "Go back to brief me AI"
                    }
                },
                relationships: {
                    store: {
                        data: {
                            type: "stores",
                            id: lsqyConfig.store_id.toString(),
                        }
                    },
                    variant: {
                        data: {
                            type: "variants",
                            id: variantId.toString(),
                        }
                    }
                }
            }
        }, { headers });

        const buy_url = response.data.data.attributes.url;
        res.status(201).json({ status: true, url: buy_url });

    } catch (err) {
        console.log("subscription error : " + err.message);
        if (err.response) {
            console.log("LemonSqueezy Error Response:", JSON.stringify(err.response.data, null, 2));
        }
        res.status(400).json({ status: false, error: err.response?.data || err.message });
    }
};


module.exports = { getProducts, getVariants, subscribtion };