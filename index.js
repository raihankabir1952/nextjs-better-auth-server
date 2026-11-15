import express from 'express'
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv'


//load enviroment variables
dotenv.config();

//create express app
const app = express();

//MongoDB connection
const client = new MongoClient(process.env.BETTER_AUTH_DB_URL)
const db = client.db("acme-store")

// Middleware: Read JSON data from client requests
app.use(express.json())

// Route 1: Check whether the backend server is running
app.get('/', (req, res) => {
    res.send("ACME Store Backend is running!")
})

// Route 2: Get all products from the database
app.get("/products", (req, res) => {
    const products = [
        {
            id: 1,
            name: "Laptop",
            price: 75000
        },
        {
            id: 2,
            name: "Mobile",
            price: 25000
        },
        {
            id: 3,
            name: "Headphone",
            price: 3000
        }
    ];

    res.json(products);
});

// Route 3: Show API information
app.get('/about', (req, res) => {
    res.send("Welcome to ACME Store API")
})

//Route 4: Create a new product
app.post('/products', (req, res) =>{
    const newProduct = req.body;
    // console.log(newProduct);
    res.json({
        message: "product created successfully",
        product: newProduct
    })
})
//connect to MongoDB
await client.connect();
console.log("MongoDB connected successfully!");

// Start the server on port 5000
app.listen(5000, () => {
    console.log("Server is running on port 5000");
})