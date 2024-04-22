const keys = require("./keys");

// Express App Setup
const express = require("express");

// Body parser is used to parse incoming requests that are in JSON format.
const bodyParser = require("body-parser");

// CORS is used to allow requests from one domain to another domain.
const cors = require("cors");

const app = express();
app.use(cors()); // Allow any domain to make requests to our server.
app.use(bodyParser.json()); // Parse incoming requests that are in JSON format.

// Postgres Client Setup
const { Pool } = require("pg");
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort,
  ssl:
    process.env.NODE_ENV === "production"
      ? false
      : { rejectUnauthorized: false },
});

// We have to initially create a table that will store all the indices and their corresponding fibonacci values.
// Create the table only if the connection to the Postgres database is successful.
pgClient.on("connect", (client) => {
  client
    .query("CREATE TABLE IF NOT EXISTS values (number INT)")
    .catch((err) => console.error(err));
});

// Redis Client Setup
const redis = require("redis");

// We'll create a connection to Redis.
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000,
  // If we ever lose connection to the Redis server, how often should we try to reconnect? We'll try to reconnect once every 1000 ms (1 second).
});

// Setting a more descriptive name compared to the worker since we have a lot more variables here.
// We'll create a duplicate connection to Redis.
// This is because according to the official Redis documentation, when a connection is turned into a subscriber, it cannot be turned back into a normal connection.
// So, we'll use this duplicate connection to publish messages.
const redisPublisher = redisClient.duplicate();

// Express route handler
app.get("/", (req, res) => {
  res.send("Hi");
});

app.get("/values/all", async (req, res) => {
  // Fetch all the indices and their corresponding fibonacci values from the Postgres database.
  const values = await pgClient.query("SELECT * from values");
  res.send(values.rows);
});

// Redis client library doesn't have promise support.
app.get("/values/current", async (req, res) => {
  // Fetch all the indices and their corresponding fibonacci values from the Redis cache.
  redisClient.hgetall("values", (err, values) => {
    res.send(values);
  });
});

// The post request will be used to insert a new index into the Postgres database and the Redis cache.
app.post("/values", async (req, res) => {
  const index = req.body.index;

  // If the index is greater than 40, return an error.
  if (parseInt(index) > 40) {
    return res.status(422).send("Index too high");
  }

  // Insert the index into the Redis cache.
  redisClient.hset("values", index, "Nothing yet!");
  // Publish a message to the worker process that a new index has been inserted.
  redisPublisher.publish("insert", index);
  // Insert the index into the Postgres database.
  pgClient.query("INSERT INTO values(number) VALUES($1)", [index]);

  res.send({ working: true });
});

app.listen(5000, (err) => {
  console.log("Listening");
});
