const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
// This is your test secret API key.
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;
//mailgun instance
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

const mg = mailgun.client({
	username: 'api',
	key: process.env.MAIL_GUN_API_KEY,
});
//middlewares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.abac1va.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("BistroDB").collection("users");
    const menuCollection = client.db("BistroDB").collection("menu");
    const reviewCollection = client.db("BistroDB").collection("reviews");
    const cartCollection = client.db("BistroDB").collection("cartItems");
    const paymentsCollection = client.db("BistroDB").collection("payments");

    // <---------------- JWT token ---------------->
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1hr",
      });
      res.send({ token });
    });

    // <---------------- Users ---------------->
    //set User data
    app.post("/users", async (req, res) => {
      const user = req.body;
      /** insert email if user doesn't exists
       * we can do this in many ways
       * 1. by making email unique
       * 2. upsert
       * 3. simple checking
       */
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists!", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //middleware to verify access token
    const verifyToken = (req, res, next) => {
      console.log("inside verify token: ", req.headers);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden access!" });
      }
      const token = req.headers.authorization.split(" ")[1];
      // console.log(token);
      if (!token) {
        return res.status(401).send({ message: "Unauthorized access!" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: "Unauthorized access!" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/users/admin/:email", verifyToken, verifyAdmin, async (req, res) => {
      console.log("Message: ", req.params.email, req.decoded.email);
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access!" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      // console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // make an admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        // console.log(id);
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // <---------------- Menu ---------------->
    //get all menu
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get(`/menu/:id`, async (req, res) => {
      const id = req.params.id;
      if (!id || id.length !== 24) {
        return res.status(400).json({ error: "Invalid id parameter" });
      }
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.find(query).toArray();
      res.send(result);
    });

    // secure the server side api with verifying as an user and also as an admin
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });

    app.patch("/menu/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      console.log(filter);
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
        },
      };
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      console.log("Filter: ", filter);
      const result = await menuCollection.deleteOne(filter);
      res.send(result);
    });

    // <---------------- Review ---------------->
    //get all menu
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    //<---------------- Cart ---------------->
    app.post("/cart", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.get("/cart", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/cart/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    //<---------------- Payment related API ---------------->
    // Stripe payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100); //it converts the taka to poisha
      console.log("Amount inside the intent: ", amount);

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        // automatic_payment_methods: {
        //   enabled: true,
        // },
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      payment.menuItemIds = payment.menuItemIds.map(id => new ObjectId(id));  // edited--------------->
      const paymentResult = await paymentsCollection.insertOne(payment);
      //carefully delete each item from the cart
      console.log("Payment Info: ", payment);
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cartCollection.deleteMany(query);
      //user user mail about payment confirmation
      mg.messages
	.create(process.env.MAIL_GUN_SENDING_DOMAIN, {
		from: "Mailgun Sandbox <postmaster@sandbox3c6f688ad1864fee9d34d61411f35aea.mailgun.org>",
		to: ["shukantobaidya2018@gmail.com"],
		subject: "Bistro Boss Order Confirmation",
		text: "Testing some Mailgun awesomness!",
    html:`
    <div>
    <h1>Thanks for your order</h1>
    <p>Your transaction Id: ${payment.transactionId}</p>
    <a href="https://bistro-boss-restaurant-mern.web.app/order/salad">Continue Shopping!</a>
    </div>
    `
    
	})
	.then(msg => console.log(msg)) // logs response data
	.catch(err => console.log(err)); // logs any error`;

      res.send({ paymentResult, deleteResult });
    });

    //get individual's payment history
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      console.log(query);
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access!" });
      }
      const result = await paymentsCollection
        .find(query)
        .sort({ _id: -1 })
        .toArray();
      console.log(result);
      res.send(result);
    });

    //get all payment history
    app.get("/payments", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentsCollection
        .find()
        .sort({ _id: -1 })
        .toArray();
      console.log(result);
      res.send(result);
    });

    // admin-stats
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const customers = await userCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();
      //this is not the best way to calculate the revenue by getting all the data and then from those data, calculating the revenue. use $sum operator of mongodb to save the sever form loading all the data
      // const payments =  await paymentsCollection.find().toArray();
      // const revenue = payments.reduce((total, payment)=> total + payment.price,0)

      const revenueResult = await paymentsCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$price" },
            },
          },
        ])
        .toArray();
      const revenue =
        revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
      res.send({
        customers,
        products,
        orders,
        revenue,
      });
    });

    //Order-stats = using aggregate pipeline
    app.get("/order-stats", async (req, res) => {
      const result = await paymentsCollection
        .aggregate([
          {
            $unwind: "$menuItemIds",

          },
          {
            $lookup: {
              from: "menu",
              localField: "menuItemIds",
              foreignField: "_id",
              as: "menuItemData",
            },
          },
          {
            $unwind: "$menuItemData"
          },
          {
            $group: {
              _id: "$menuItemData.category",
              quantity: {
                $sum: 1
              },
              totalRevenue: {$sum: "$menuItemData.price"},
            }
          },
          {
            $project:{
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              revenue: "$totalRevenue",
            }
          }
        ])
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Restaurant is Open now!");
});
app.listen(port, () => {
  console.log(`Bistro Boss is sitting on port`, port);
});
