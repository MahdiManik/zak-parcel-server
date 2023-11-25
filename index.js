const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 7000;
require("dotenv").config();
//const stripe = require("stripe")(process.env.PAYMENT_GATWAY_SK);

app.use(cors());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rg5wc51.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//middlewares for token verify
const verifyToken = (req, res, next) => {
  console.log("inside the verifyToken", req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      res.status(401).send({ message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    //await client.connect();

    const userCollection = client.db("zakParcel").collection("users");

    //jwt token set on local storage
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //admin get for any admin work
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      //  console.log("email form route", email);
      //  console.log("decoded form route", req.decoded?.email);
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.userType === "admin";
      }
      res.send({ admin });
    });

    //delivery man get for any work of delivery man
    app.get("/users/delivery-man/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      //  console.log("email form route", email);
      //  console.log("decoded form route", req.decoded?.email);
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let deliveryMan = false;
      if (user) {
        deliveryMan = user?.userType === "deliveryMan";
      }
      res.send({ deliveryMan });
    });

    //user created and stored on mongodb
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Zak parcel running");
});

app.listen(port, () => {
  console.log(`Zak parcel running on port ${port}`);
});
