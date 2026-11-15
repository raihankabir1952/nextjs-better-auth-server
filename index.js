import express from 'express'
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv'
import cors from 'cors'


//load enviroment variables
dotenv.config();

//create express app
const app = express();

//MongoDB connection
const client = new MongoClient(process.env.BETTER_AUTH_DB_URL)
const db = client.db("acme-store")

//select products collection
const productsCollection = db.collection("products")

// Middleware: Read JSON data from client requests
app.use(express.json())
app.use(cors())

// Route 1: Check whether the backend server is running
app.get('/', (req, res) => {
    res.send("ACME Store Backend is running!")
})

// Route 2: Get all products from the database
app.get("/products", async(req, res) => {
    const products = await productsCollection.find().toArray();
    res.json(products);
});

// Route 3: Show API information
app.get('/about', (req, res) => {
    res.send("Welcome to ACME Store API")
})

//Route 4: Create a new product
app.post('/products', async(req, res) =>{
    const newProduct = req.body;
    const result = await productsCollection.insertOne(newProduct);
    res.json({
        message: "product created successfully",
        productId: result.insertedId
    })
})
//connect to MongoDB
await client.connect();
console.log("MongoDB connected successfully!");

// Start the server on port 5000
app.listen(5000, () => {
    console.log("Server is running on port 5000");
})