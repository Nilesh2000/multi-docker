const keys = require('./keys');
const redis = require('redis');

const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000 
// If we ever lose connection to the Redis server, how often should we try to reconnect? We'll try to reconnect once every 1000 ms (1 second).
});

// We'll create a duplicate connection to Redis.
// This is because according to the official Redis documentation, when a connection is turned into a subscriber, it cannot be turned back into a normal connection.
// So, we'll use this duplicate connection to publish messages.
const sub = redisClient.duplicate();

// Purposefully using a recursive function which is slow and hence gives us a better reason to use Redis and have a worker process.
function fib(index) {
  if (index < 2) return 1;
  return fib(index - 1) + fib(index - 2);
}

// The redis subscriber is going to watch for any new messages that show up on the 'insert' channel.
sub.on('message', (channel, message) => {
    // Whenever we get a new message, calculate the fibonacci value and insert it into a hash called 'values'. The key will be the message and the value will be the fibonacci value.
    redisClient.hset(
        'values',
        message,
        parseInt(fib(parseInt(message)))
    )
});
// Anytime we see a new value inserted into Redis, we'll calculate the new fibonacci value and insert it into the 'values' hash.
// Subscribe to the 'insert' channel.
sub.subscribe('insert');