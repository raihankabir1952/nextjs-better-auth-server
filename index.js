
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import Stripe from 'stripe';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';

// Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create Express app
const app = express();

// MongoDB connection
const client = new MongoClient(process.env.BETTER_AUTH_DB_URL);
const db = client.db('acme-store');

// Select collections
const productsCollection = db.collection('products');
const ordersCollection = db.collection('orders');

// CORS Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

// Stripe Webhook Route
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {

    const sig = req.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

    } catch (err) {
        console.log('Webhook Signature Verification Failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('Webhook Event Received:', event.type);

    if (event.type === 'checkout.session.completed') {

        const session = event.data.object;

        console.log('Checkout Session Completed!');

        if (session.payment_status === 'paid') {

            const existingOrder = await ordersCollection.findOne({
                stripeSessionId: session.id
            });

            if (!existingOrder) {

                const newOrder = {
                    productId: new ObjectId(session.metadata.productId),
                    productName: session.metadata.productName,
                    customerEmail: session.customer_details?.email,
                    amount: session.amount_total,
                    currency: session.currency,
                    paymentStatus: session.payment_status,
                    stripeSessionId: session.id,
                    paymentIntentId: session.payment_intent,
                    createdAt: new Date()
                };

                await ordersCollection.insertOne(newOrder);

                console.log('Order Saved Successfully!');
            }
        }
    }

    res.json({ received: true });
});

// Read JSON data from normal client requests
app.use(express.json());

// Session Verification API
// Session Verification API
app.get("/api/me", async (req, res) => {
    console.log("Cookie received:", Boolean(req.headers.cookie));

    console.log(
        "Cookie names:",
        req.headers.cookie
            ?.split(";")
            .map(cookie => cookie.trim().split("=")[0])
    );

    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!session) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        return res.status(200).json({
            message: "Session verified successfully",
            user: session.user,
        });

    } catch (error) {
        console.error("Session verification error:", error);

        return res.status(500).json({
            message: "Internal Server Error",
        });
    }
});

// Check Backend Server
app.get('/', (req, res) => {
    res.send('ACME Store Backend is running!');
});

// Get All Products
app.get('/products', async (req, res) => {
    const products = await productsCollection.find().toArray();
    res.json(products);
});

// Get All Orders
app.get('/orders', async (req, res) => {
    const orders = await ordersCollection.find().toArray();
    res.json(orders);
});

// API Information
app.get('/about', (req, res) => {
    res.send('Welcome to ACME Store API');
});

// Create Product
app.post('/products', async (req, res) => {
    const newProduct = req.body;

    const result = await productsCollection.insertOne(newProduct);

    res.json({
        message: 'product created successfully',
        productId: result.insertedId
    });
});

// Delete Product
app.delete('/products/:id', async (req, res) => {
    const productId = req.params.id;

    const result = await productsCollection.deleteOne({
        _id: new ObjectId(productId)
    });

    if (result.deletedCount === 0) {
        return res.status(404).json({
            message: 'Product not found'
        });
    }

    res.json({
        message: 'Product deleted successfully'
    });
});

// Update Product
app.put('/products/:id', async (req, res) => {
    const productId = req.params.id;
    const updatedProduct = req.body;

    const result = await productsCollection.updateOne(
        {
            _id: new ObjectId(productId)
        },
        {
            $set: updatedProduct
        }
    );

    if (result.matchedCount === 0) {
        return res.status(404).json({
            message: 'Product not found'
        });
    }

    res.json({
        message: 'Product updated successfully'
    });
});

// Get Single Product
app.get('/products/:id', async (req, res) => {
    const productId = req.params.id;

    const product = await productsCollection.findOne({
        _id: new ObjectId(productId)
    });

    if (!product) {
        return res.status(404).json({
            message: 'Product not found'
        });
    }

    res.json(product);
});

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {

    const { productId } = req.body;

    const product = await productsCollection.findOne({
        _id: new ObjectId(productId)
    });

    if (!product) {
        return res.status(404).json({
            message: 'Product not found'
        });
    }

    console.log('Creating Stripe Checkout Session...');

    const session = await stripe.checkout.sessions.create({
        mode: 'payment',

        line_items: [
            {
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: product.name
                    },
                    unit_amount: Number(product.price)
                },
                quantity: 1
            }
        ],

        metadata: {
            productId: product._id.toString(),
            productName: product.name
        },

        success_url: 'http://localhost:3000/payment/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost:3000/payment/cancel'
    });

    console.log('Checkout Session Created:', session.id);

    res.json({
        url: session.url
    });
});

// Connect to MongoDB
await client.connect();

console.log('MongoDB connected successfully!');

// Start Server
app.listen(5000, () => {
    console.log('Server is running on port 5000');
});
