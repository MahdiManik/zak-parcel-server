const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 7000;
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_GATWAY_SK);

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
  //  console.log("inside the verifyToken", req.headers.authorization);
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

const verifyAdmin = async (req, res, next) => {
  const email = req.decoded?.email;
  const query = { email: email };
  const user = await userCollection.findOne(query);
  const isAdmin = user?.role === "admin";
  if (!isAdmin) {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

async function run() {
  try {
    //await client.connect();

    const userCollection = client.db("zakParcel").collection("users");
    const bookingCollection = client.db("zakParcel").collection("bookings");
    const deliveredCollection = client.db("zakParcel").collection("delivered");
    const paymentCollection = client.db("zakParcel").collection("payments");
    const parcelInfoCollection = client
      .db("zakParcel")
      .collection("parcelInfo");

    //jwt token set on local storage
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      //  console.log(process.env.ACCESS_TOKEN_SECRET);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ token });
    });

    //payment get
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params?.email };
      if (req.params?.email !== req?.decoded?.email) {
        res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    //payment created
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      console.log(payment);
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await bookingCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });

    //PAYMENT gat way strip
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecrets: paymentIntent.client_secret,
      });
    });

    // all parcel get for admin
    app.get("/bookings", async (req, res) => {
      const result = await bookingCollection.find().toArray();
      res.send(result);
    });

    //booking data load with Id for update
    //app.get("/booking/:id", async (req, res) => {
    //  const id = req.params.id;
    //  const query = { _id: new ObjectId(id) };
    //  const result = await bookingCollection.find(query).toArray();
    //  res.send(result);
    //});

    //all delivery man delivered parcel
    app.get("/booking-deliveryMan/:deliveryManId", async (req, res) => {
      const deliveryManId = req.params.deliveryManId;
      const query = { deliveryManId: deliveryManId };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    // parcel data load for a user
    app.get("/bookings/:email", verifyToken, async (req, res) => {
      const query = { email: req.params?.email };
      console.log("Received email:", query.email);
      if (req.params?.email !== req.decoded?.email) {
        res.status(403).send({ message: "Forbidden access" });
      }
      //  console.log(query);
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    // create a booking data
    app.post("/bookings", async (req, res) => {
      const query = req.body;
      const result = await bookingCollection.insertOne(query);
      const updateD = {
        $inc: {
          bookingCount: 1,
        },
      };
      const updateUser = await userCollection.updateOne(
        {
          email: req.body.email,
        },
        updateD
      );
      res.send(result);
    });

    //update user to admin
    app.patch("/parcel/:id", async (req, res) => {
      const query = req.body;
      //  console.log("query", query);
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };

      const update = {
        $set: {
          status: query?.status,
        },
      };
      const result = await bookingCollection.updateOne(filter, update);
      res.send(result);
    });

    // load parcel info
    app.get("/parcel-info", async (req, res) => {
      const parcelInfo = req.query?.email;
      const result = await parcelInfoCollection
        .find({ email: parcelInfo })
        .toArray();
      res.send(result);
    });

    app.get("/info-parcel", async (req, res) => {
      const result = await parcelInfoCollection.find().toArray();
      res.send(result);
    });

    // admin create parcel info for sending to user booking
    app.post("/parcel-info", async (req, res) => {
      const query = req.body;
      const result = await parcelInfoCollection.insertOne(query);
      res.send(result);
    });

    //admin get for any admin work
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
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
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let deliveryMan = false;
      if (user) {
        deliveryMan = user?.userType === "deliveryMan";
        //console.log(user?.userType);
      }
      res.send({ deliveryMan });
    });

    // delivery man data load
    app.get("/users/delivery-man", async (req, res) => {
      const deliveryMen = await userCollection
        .find({ userType: "deliveryMan" })
        .toArray();
      res.send(deliveryMen);
    });

    //delivery man data load
    app.get("/users/users", async (req, res) => {
      const users = await userCollection.find({ userType: "user" }).toArray();
      res.send(users);
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
