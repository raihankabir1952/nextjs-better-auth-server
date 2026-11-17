import express from 'express'
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv'
import cors from 'cors'
import Stripe from 'stripe';
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";


//load enviroment variables
dotenv.config();

//stripe 
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

//create express app
const app = express();

//MongoDB connection
const client = new MongoClient(process.env.BETTER_AUTH_DB_URL)
const db = client.db("acme-store")

//select products collection
const productsCollection = db.collection("products")
const ordersCollection = db.collection("orders")

// Middleware: Read JSON data from client requests
app.use(cors())

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
        console.log("Webhook Signature Verification Failed:", err.message);

        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("Webhook Event Received:", event.type);

    if (event.type === 'checkout.session.completed') {

        const session = event.data.object;

        console.log("Checkout Session Completed!");

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

                console.log("Order Saved Successfully!");
            }
        }
    }

    res.json({ received: true });
});

// Read JSON data from normal client requests
app.use(express.json())

//session verification api
app.get('/api/me', async (req, res) =>{
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.header),
    });

    if(!session){
        return res.status(401).json({
            message: "Unauthorized",
        })
    }

    res.json({
        message: "Session verified successfully",
        user: session.user
    });
});

// Route 1: Check whether the backend server is running
app.get('/', (req, res) => {
    res.send("ACME Store Backend is running!")
})

// Route 2: Get all products from the database
app.get("/products", async (req, res) => {
    const products = await productsCollection.find().toArray();
    res.json(products);
});

//Route: Get all orders
app.get('/orders', async (req, res) => {
    const orders = await ordersCollection.find().toArray();
    res.json(orders)
})

// Route 3: Show API information
app.get('/about', (req, res) => {
    res.send("Welcome to ACME Store API")
})

//Route 4: Create a new product
app.post('/products', async (req, res) => {
    const newProduct = req.body;
    const result = await productsCollection.insertOne(newProduct);
    res.json({
        message: "product created successfully",
        productId: result.insertedId
    })
})

//Route 5: Delete a product
app.delete('/products/:id', async (req, res) => {
    const productId = req.params.id;

    const result = await productsCollection.deleteOne({
        _id: new ObjectId(productId)
    });
    if (result.deletedCount === 0) {
        return res.status(404).json({
            message: "Product not found"
        });
    }
    res.json({
        message: "Product deleted successfully"
    });
});

//Route 6: Update an existing product
app.put('/products/:id', async (req, res) => {
    const productId = req.params.id;
    const updatedProduct = req.body;

    const result = await productsCollection.updateOne({
        _id: new ObjectId(productId),
    }, {
        $set: updatedProduct
    }
    );
    if (result.matchedCount === 0) {
        return res.status(404).json({
            message: "Product not found"
        })
    }
    res.json({
        message: "Product updated successfully"
    });
});

//Route 7: Get a single product by ID
app.get('/products/:id', async (req, res) => {
    const productId = req.params.id;

    const product = await productsCollection.findOne({
        _id: new ObjectId(productId)
    });
    if (!product) {
        return res.status(404).json({
            message: "Product not found"
        })
    }
    res.json(product)
});

//Route: Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
    const { productId } = req.body;

    // Find product from MongoDB
    const product = await productsCollection.findOne({
        _id: new ObjectId(productId)
    });

    if (!product) {
        return res.status(404).json({
            message: "Product not found"
        });
    }

    console.log("Creating Stripe Checkout Session...");

    // Create Stripe Checkout Session
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

    console.log("Checkout Session Created:", session.id);

    res.json({
        url: session.url
    });
});


//connect to MongoDB
await client.connect();
console.log("MongoDB connected successfully!");

// Start the server on port 5000
app.listen(5000, () => {
    console.log("Server is running on port 5000");
})